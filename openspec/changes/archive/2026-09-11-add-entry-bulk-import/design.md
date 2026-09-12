## Context

Confirmed by reading the actual code:

- **Menu** (`apps/web/src/components/AppHeader.tsx:208-243`): the Entries section already has "Add" (`/entries/new`, all logged-in users) and "Delete" (`/entries/delete`, `isAdmin`-gated). A new "Import" item goes right after "Delete", identical shape, navigating to `/entries/import`.
- **Route guard**: every admin-only page uses the same `beforeLoad` (`admin.tsx:39-50`, `entries/delete.tsx`): fetch `["auth","me"]` via `apiMe`, redirect to `/login` if absent, redirect to `/` if `role !== "ADMIN"`.
- **Dictionary picker**: no native `<select>` exists anywhere in this app. The established pattern (`entries/new.tsx:52-61`) is a `Button` opening a shadcn `CommandDialog`/`CommandInput`/`CommandList`/`CommandGroup`/`CommandItem` picker backed by `useQuery({ queryKey: ["series","list"], queryFn: () => apiGetSeriesList() })`. Reused verbatim.
- **Single-entry creation pipeline** (`apps/api/src/routes/entries.ts:97-187`, `POST /api/series/:slug/entries`) is the template for the bulk path:
  - `sortKey = normalizeWord(headword)`; `normalizeWord = (v) => v.trim().toLowerCase()` (`packages/shared/src/validation.ts:29-31`) — this is exactly what "case-insensitive match" means.
  - `definitionHtml = sanitizeDefinitionHtml(...)` (`packages/shared/src/sanitize.ts:13-26`) allowlists `p,b,i,em,strong,sup,sub,br,ul,ol,li,span,a`. It does **not** convert `\n` to `<br>` — nothing in the codebase does this today.
  - `approvalStatus: isAdmin ? "APPROVED" : "PENDING"` — since the import route is entirely admin-gated, imported entries are always `APPROVED`, matching this exact existing condition.
  - Duplicate detection is not a pre-check query — it relies on `SeriesWord`'s `@@unique([seriesId, normalizedWord])` constraint throwing Postgres P2002, caught via `isPrismaError(err, "P2002")`.
  - `packages/shared/src/entries.ts`: `definitionHtmlSchema` (trimmed, 1-5000 chars) and `singleWordText` (headwords/inflections may not contain whitespace, per the existing "no spaces in headwords" rule). `singleWordText` is currently file-private and needs to be exported for reuse.
- **Critical, verified constraint**: Postgres aborts an entire transaction on the first errored statement inside it — every later statement on that same transaction fails until rollback, even unrelated ones. A single `$transaction(...)` wrapping the whole import with a try/catch per item cannot implement skip-and-continue: the `catch` only swallows the JS exception, but the underlying transaction is already unusable for every statement after the first failure. This rules out "one big transaction" as an option, not just as a style preference.
- **No progress-bar or file-upload precedent exists** anywhere in the web app (no `progress.tsx`, no `FileReader`/`type="file"` usage, no polling/SSE infrastructure). Confirmed with the user: an indeterminate progress bar is sufficient — building real per-item progress would require new job-status/polling infrastructure disproportionate to this feature.
- **Fastify's default `bodyLimit` is 1 MiB** (no override exists in `apps/api/src/index.ts`) — a real multi-hundred-entry glossary file can plausibly exceed that once JSON-stringified.

## Goals / Non-Goals

**Goals:**
- Bulk-create entries from a flat JSON headword→definition file, admin-only.
- Skip individual bad/duplicate rows without failing the whole batch.
- Reuse the existing entry-creation pipeline's validation, normalization, sanitization, and duplicate-detection mechanics rather than inventing a parallel one.

**Non-Goals:**
- Real per-item progress reporting (no job/polling infrastructure exists or is being added for this).
- Client-side chunking of very large files into multiple requests (deferred unless real-world timing proves it necessary).
- Supporting inflections, part-of-speech, or any metadata beyond headword+definition in the import file (the file shape is a flat `{headword: definition}` map, matching the user-provided sample).
- A live "N of these already exist" preview before the admin clicks Import.

## Decisions

1. **New shared schemas** in `packages/shared/src/entryImport.ts`:
   ```ts
   export const MAX_IMPORT_ENTRIES = 5000; // generous multiple of a real ~1,500-entry sample file
   export const IMPORT_RESULT_LIST_CAP = 200; // caps response payload size on huge files

   export const importEntriesRequestSchema = z.object({
     entries: z.record(z.string(), z.unknown())
       .refine((v) => Object.keys(v).length > 0, { message: "The file contains no entries." })
       .refine((v) => Object.keys(v).length <= MAX_IMPORT_ENTRIES, {
         message: `An import file can contain at most ${MAX_IMPORT_ENTRIES} entries.`,
       }),
   });

   export const importEntriesResultDtoSchema = z.object({
     totalInFile: z.number().int(),
     createdCount: z.number().int(),
     skippedDuplicateCount: z.number().int(),
     skippedInvalidCount: z.number().int(),
     createdHeadwords: z.array(z.string()),
     skippedDuplicateHeadwords: z.array(z.string()),
     skippedInvalid: z.array(z.object({ headword: z.string(), reason: z.string() })),
     truncated: z.boolean(),
   });
   ```
   Values are typed `z.unknown()`, not `z.string()`, deliberately: `z.record(z.string(), z.string())` would make Zod reject the *entire request* on the first non-string value, contradicting "skip bad rows, don't fail the batch." The per-row type check happens by hand inside the processing loop (Decision 4), so every failure mode — wrong type, multi-word headword, empty string, oversized definition, duplicate — goes through the same skip-with-reason path instead of two different failure semantics depending on which rule was violated.

2. **Export `singleWordText`** from `packages/shared/src/entries.ts` (currently file-private) — additive, nothing depends on it staying unexported. Reused by the import route for headword validation, identical to the single-entry route's rule.

3. **New `plainTextToSafeHtml(text: string): string`** in `packages/shared/src/sanitize.ts`, exported alongside `sanitizeDefinitionHtml`: escapes `&` and `<` in the raw text first, then replaces `\n` with `<br>` (order matters — escaping must happen before the literal `<br>` tags are injected, or they'd be escaped too). The import route runs its output through `sanitizeDefinitionHtml` afterward as well, as defense-in-depth consistent with the single-entry write path's guarantee that only sanitized HTML ever reaches the database.

4. **New route** `apps/api/src/routes/entryImports.ts` — `POST /api/series/:slug/entries/import`, `preHandler: requireAdmin`, `config: { bodyLimit: 20 * 1024 * 1024 }` (scoped to this route, not raised globally). The request body is the already-client-parsed JSON object (`{ entries: {...} }`) sent as normal `application/json` — no multipart file upload on the wire, since the browser already does `file.text()` → `JSON.parse()` before the Import button is even enabled. This route is deliberately **not** subject to the existing `WRITE_RATE_LIMIT` (60 writes/hour/user) — that budget exists for organic per-request submissions and would make a legitimate multi-hundred-row import mathematically impossible in one request; abuse is bounded instead by `requireAdmin` plus `MAX_IMPORT_ENTRIES`.

   Processing iterates `Object.entries(body.entries)` **sequentially** (`for...of` with `await`, not `Promise.all`) — this also gives free in-file duplicate detection: two keys that normalize to the same word (e.g. `"Abelon"` / `"abelon"`) have the second hit the same `SeriesWord` unique constraint the first one just committed, so no separate in-memory tracking set is needed; it falls directly out of processing one at a time. Per item:
   1. Non-string value → skip, reason "Definition is not a string."
   2. `singleWordText({ max: 200 }).safeParse(headword)` fails (empty after trim, >200 chars, contains whitespace) → skip, reason from the Zod error.
   3. Convert the definition via `plainTextToSafeHtml`, then `sanitizeDefinitionHtml`.
   4. `definitionHtmlSchema.safeParse(convertedHtml)` fails (empty after trim, >5000 chars) → skip, reason from the Zod error.
   5. One `Serializable` transaction per surviving item: `entry.create` (`approvalStatus: "APPROVED"`, `submittedById`/`reviewedById`/`reviewedAt` = the importing admin) → `seriesWord.create` (one row; imported entries have no inflections) → `revision.create` (`action: "CREATE"`) → `markSeriesDirty(tx, series.id)` — structurally identical to the admin-auto-approve branch of the existing single-entry route. `catch`: `isPrismaError(err, "P2002")` → skip as duplicate; any other error rethrows and 500s the whole request (a genuine DB/infra failure should surface, not be silently swallowed per-row).

   A code comment in this file states the Postgres-transaction-abort constraint explicitly, so a future "simplification" into one big transaction doesn't silently reintroduce the bug of stopping all creates after the first collision.

   Response reports the counts and capped headword lists per Decision 1. Registered in `apps/api/src/index.ts` (alongside `entriesRoutes`) and in `apps/api/tests/helpers.ts`'s `buildApp()`.

5. **Frontend page** `apps/web/src/routes/entries/import.tsx`:
   - Admin-only `beforeLoad`, matching `entries/delete.tsx` (not the looser approved-member check in `entries/new.tsx`).
   - Dictionary picker: verbatim reuse of the `CommandDialog` pattern from `entries/new.tsx`.
   - File chooser: `<input type="file" accept=".json,application/json">` (new markup, no existing precedent, no new dependency). On change: reset prior state → `file.text()` → `JSON.parse` (catch → "This file is not valid JSON.") → shape-validate client-side (must be a non-null, non-array plain object; non-empty; every value a string; not over `MAX_IMPORT_ENTRIES` keys, for instant feedback). Valid → show the file name on the next line and store the parsed object. Invalid → inline error next to the file chooser. The client only validates the file's overall *shape*; per-row correctness (headword spaces, definition length) is the server's job, avoiding two copies of the same validation logic drifting apart.
   - Import button: `disabled={!selectedSeries || !parsedEntries || mutation.isPending}`.
   - `useMutation` calling a new `apiImportEntries(seriesSlug, entries)` in `apps/web/src/lib/api.ts` (same `fetch` + `handleResponse<T>` shape as every other call there). `onSuccess`: toast summarizing created/skipped-duplicate/skipped-invalid counts (noting truncation if applicable). `onError`: `toast.error(err instanceof ApiError ? err.message : "Import failed.")`.
   - Progress: new minimal `apps/web/src/components/ui/progress.tsx` — a plain Tailwind-animated indeterminate bar (`role="progressbar" aria-busy="true"`, no percentage), rendered only while `mutation.isPending`. Not the canonical shadcn `Progress` (wraps `@radix-ui/react-progress` for a *determinate* value and isn't installed in this repo) — there is no per-item progress signal to drive a determinate bar with.

6. **Menu wiring**: one more `isAdmin`-gated `DropdownMenuItem` in `AppHeader.tsx`, right after "Delete" in the Entries shelf, navigating to `/entries/import`.

## Risks / Trade-offs

- **[Risk]** N per-item transactions (one round trip each) instead of one bulk write could be slow for very large files. → **Mitigation**: acceptable for a one-shot admin action at the sizes involved (~1,500 entries × a few ms each); an explicit verification task times the import against the real sample file, with client-side request chunking flagged as a follow-up only if that timing proves it necessary — not built preemptively.
- **[Risk]** Raising `bodyLimit` only on this one route is easy to get wrong (e.g. accidentally applying it globally, widening the attack surface for every route). → **Mitigation**: set via the route-level `config` option exactly as `WRITE_RATE_LIMIT` is already set per-route elsewhere in this codebase, not via the top-level `Fastify(...)` options.
- **[Risk]** A future contributor "simplifies" the per-item-transaction loop into one big transaction, silently breaking skip-on-duplicate for every row after the first collision. → **Mitigation**: explicit code comment in `entryImports.ts` stating the Postgres transaction-abort behavior as the reason, not just a style choice.

## Migration Plan

Purely additive: new route, new shared schemas, new frontend page and menu item. No schema migration (no new Prisma model — reuses `Entry`/`SeriesWord`/`Revision`). No changes to any existing route's behavior. Rollback is a plain revert; nothing depends on the new code existing.
