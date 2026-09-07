## Context

See proposal.md - Why. Confirmed by reading the current code (current as of this session — earlier findings this session already shifted line numbers in both files, but the pattern is unchanged):

- `apps/api/src/routes/entries.ts`'s `POST /api/series/:slug/entries` handler, inside `prisma.$transaction(..., { isolationLevel: "Serializable" })`, loops over `body.inflections` doing one `tx.inflection.create()` + one `tx.seriesWord.create()` per inflection — `1 + 2N` round trips (the `1` is the headword's own `SeriesWord` row).
- `apps/api/src/routes/entryEditProposals.ts`'s shared `applyEditProposalToEntry(tx, entry, proposal, reviewerId)` (used by both admin-approval call sites, each already inside their own `Serializable` transaction) does the same `create`+`create` pattern per added inflection, plus a separate `tx.inflection.delete()` per removed inflection — `toRemove.length + 2*toAdd.length` round trips.
- The same file's proposal-*submission* handler creates `EntryEditProposalInflection` rows via a nested `inflections: { create: body.inflections.map((value) => ({ value })) } }` — a single-table nested array-`create`, which Prisma does not batch into one statement.

Relevant schema (unchanged by this design):

```prisma
model Inflection {
  id      String      @id @default(cuid())
  entryId String
  entry   Entry       @relation(fields: [entryId], references: [id], onDelete: Cascade)
  value   String
  word    SeriesWord?

  @@unique([entryId, value])
}

model SeriesWord {
  id             String      @id @default(cuid())
  seriesId       String
  normalizedWord String
  entryId        String
  inflectionId   String?     @unique
  inflection     Inflection? @relation(fields: [inflectionId], references: [id], onDelete: Cascade)

  @@unique([seriesId, normalizedWord])
}
```

`SeriesWord.inflection` has `onDelete: Cascade` (a real Postgres `FOREIGN KEY ... ON DELETE CASCADE`) — today's per-row `tx.inflection.delete()` loop already relies on this same cascade for `SeriesWord` cleanup; there is no explicit `tx.seriesWord.delete()` call anywhere in that removal path today.

An independent Plan-agent review instantiated this repo's actual generated Prisma client to validate the claims this design depends on, rather than relying on documentation alone:

- `createManyAndReturn` runs inside a Prisma interactive `tx` exactly like any other delegate method — confirmed present on `tx.inflection` and `tx.seriesWord` in the generated client, no special caveat (its one documented restriction, `relationLoadStrategy: "join"` being unsupported, is irrelevant here since no `include`/`relationLoadStrategy` is passed).
- `@default(cuid())` is a Prisma **client-side** default (generated before SQL is built, not a Postgres-side function like `gen_random_uuid()`) — applies identically to `create`, `createMany`, and `createManyAndReturn`. Bulk operations need no caller-supplied ID generation.
- `createManyAndReturn`'s returned row order is **explicitly not guaranteed** to match the input array's order (confirmed via Prisma's own GitHub discussion #24892/#24894). The correct pattern correlates each returned row's own fields, never zips by array index.
- `createMany`/`createManyAndReturn` categorically do not support nested relation writes (confirmed via prisma/prisma#5455, prisma/orm#22452) — there is no single Prisma call that lets a newly-created `Inflection` row's generated id feed a sibling `SeriesWord` row's foreign key in the same call, since `SeriesWord` isn't a direct nested child of `Entry`. A two-phase create-then-createMany is the minimum-round-trip shape available.
- Nested `createMany` (as opposed to top-level `createMany`) **is** a supported, distinct code path for one-to-many relation writes inside a `create()` call — confirmed the generated `EntryEditProposalInflectionCreateNestedManyWithoutProposalInput` type exposes a `createMany` variant alongside `create`.
- `createManyAndReturn` is GA in Prisma (shipped GA in 5.14.0 for PostgreSQL, well before this project's 6.19.3; confirmed no `previewFeatures` block exists in `schema.prisma` regardless, so nothing to enable).

## Goals / Non-Goals

**Goals:**
- Database round trips for creating or editing an entry's inflections no longer grow linearly with inflection count (a fixed small number of statements regardless of N).
- `SeriesWord` uniqueness remains exactly as race-safe as today — same constraint, same isolation level, same error mapping.
- Mutation and revision creation remain atomic — no change to transaction boundaries.

**Non-Goals:**
- Changing what data is created, what counts as a duplicate word, or any validation logic (Zod schemas in `packages/shared/src/validation.ts` already reject same-request inflection collisions at parse time — untouched).
- Changing the transaction isolation level or introducing a new error code — the existing `Serializable` isolation and `isPrismaError(err, "P2002") → Errors.DUPLICATE_WORD()` mapping are sufficient and unchanged.
- Retrofitting any other write path — no other location in the codebase has this two-table (`Inflection` + `SeriesWord`) per-item-loop shape.
- Adding a dedicated round-trip-counting test or new Prisma query-logging test infrastructure — see Decisions below for why correctness-by-construction plus a read-through is the right verification bar here.

## Decisions

### 1. `entries.ts` create handler: two-phase batch

```ts
const inflectionRows = body.inflections.length > 0
  ? await tx.inflection.createManyAndReturn({
      data: body.inflections.map((value) => ({ entryId: created.id, value })),
    })
  : [];

await tx.seriesWord.createMany({
  data: [
    { seriesId: series.id, entryId: created.id, normalizedWord: normalizeWord(body.headword) },
    ...inflectionRows.map((row) => ({
      seriesId: series.id,
      entryId: created.id,
      inflectionId: row.id,
      normalizedWord: normalizeWord(row.value),
    })),
  ],
});
```

**Must read `row.value` off each returned row**, never `body.inflections[i]` by index — `createManyAndReturn`'s row order is not guaranteed to match input order (see Context). Net: 2 round trips total (or 1 if there are zero inflections), replacing `1 + 2N`.

Alternative considered and rejected: generating IDs in the application (the finding's own suggested alternative) and using plain `createMany` instead of `createManyAndReturn`. Rejected because `@default(cuid())` is already a client-side default — `createManyAndReturn` gets us the generated IDs in the same one round trip anyway, so hand-rolling ID generation would add complexity (a new ID-generation dependency or hand-written cuid-compatible generator) for no round-trip benefit.

Alternative considered and rejected: a single nested write from `entry.create()` creating `Inflection`s and their paired `SeriesWord` rows together. Rejected because it isn't possible in current Prisma — confirmed no nested-write form lets one created row's generated id feed a sibling relation's foreign key within the same call, and `SeriesWord` isn't a direct nested child of `Entry` in the schema.

### 2. `applyEditProposalToEntry`: batch add and remove

```ts
// Applying an approved edit... (existing markSeriesDirty call unchanged, stays before this)
try {
  await tx.entry.update({ where: { id: entry.id }, data: { definitionHtml: proposal.proposedDefinitionHtml } });

  if (toRemove.length > 0) {
    await tx.inflection.deleteMany({ where: { id: { in: toRemove.map((i) => i.id) } } });
  }

  if (toAdd.length > 0) {
    const addedRows = await tx.inflection.createManyAndReturn({
      data: toAdd.map((i) => ({ entryId: entry.id, value: i.value })),
    });
    await tx.seriesWord.createMany({
      data: addedRows.map((row) => ({
        seriesId: entry.seriesId,
        entryId: entry.id,
        inflectionId: row.id,
        normalizedWord: normalizeWord(row.value),
      })),
    });
  }
} catch (err: unknown) {
  if (isPrismaError(err, "P2002")) throw Errors.DUPLICATE_WORD();
  throw err;
}
```

**All three statements (`deleteMany`, `createManyAndReturn`, `createMany`) must stay inside the existing local `try {}`** — not just the two creation-related ones — so a same-batch conflict still maps to `DUPLICATE_WORD` rather than falling through to the outer generic `catch`. The `SeriesWord` cleanup for removed inflections continues to rely on the existing `onDelete: Cascade`, unchanged from today's per-row delete loop. Net: at most 2 round trips for removal+addition combined (a `deleteMany` and a `createManyAndReturn`+`createMany` pair), replacing `toRemove.length + 2*toAdd.length`.

### 3. Proposal-submission handler: nested `createMany`

```ts
const created = await tx.entryEditProposal.create({
  data: {
    entryId: entry.id,
    proposedDefinitionHtml: definitionHtml,
    submittedById: userId,
    baseEntryUpdatedAt: entry.updatedAt,
    inflections: { createMany: { data: body.inflections.map((value) => ({ value })) } },
  },
  include: { inflections: true },
});
```

Only the `inflections:` value changes (`create: [...]` → `createMany: { data: [...] }`); everything else in this call is untouched. `EntryEditProposalInflection` has no further nested relations of its own, so nested `createMany`'s one restriction (its rows can't carry their own further nested writes) doesn't apply. Zero behavior change — same rows created, same `include` shape returned.

### 4. Error mapping, atomicity, and race-safety are unchanged (no new decisions needed)

A unique-constraint violation anywhere inside a batched multi-row `INSERT ... VALUES (...), (...)` aborts that one statement — and, transitively, the whole enclosing transaction — exactly like a single-row `create()` failing partway through today's loop, surfacing as the same single P2002 the existing `isPrismaError(err, "P2002")` check already catches at both call sites. `packages/shared/src/validation.ts`'s Zod schemas already reject same-request inflection-vs-inflection and inflection-vs-headword collisions at parse time (400), before the transaction starts — the only thing left for `SeriesWord.[seriesId,normalizedWord]`'s DB constraint to catch is a genuine cross-request race, which a batched statement catches exactly as atomically as today's loop. `SeriesWord.inflectionId` being `@unique` is not at risk from batching: every id in one `createManyAndReturn` batch is freshly minted and distinct, so a batched `seriesWord.createMany` referencing them can't collide with itself or with a pre-existing row.

## Risks / Trade-offs

- **[Risk] A future edit "simplifies" the row-correlation into an index-based zip** (`inflectionRows[i]` against `body.inflections[i]`), silently mispairing ids and values if Postgres/Prisma ever returns rows out of input order. → Mitigation: the code as designed reads `row.value` directly off each returned row, never off the original input array by index; a comment at each call site should say why, tying it to `createManyAndReturn`'s documented non-guarantee.
- **[Risk] Forgetting to keep all three statements inside `applyEditProposalToEntry`'s local `try {}`** when restructuring the function, causing a same-batch conflict to throw an unmapped 500 instead of the expected 409. → Mitigation: called out explicitly as a tasks.md verification step, not left implicit.
- **[Risk] No dedicated test literally counts SQL round trips**, so a future regression back to a per-item loop wouldn't be caught by an automated assertion. → Accepted trade-off: Prisma's own guarantees (validated above against the actual generated client) make the round-trip reduction correct by construction once the loop is replaced; a code-shape read-through (confirming no `for` loop remains calling the per-item methods) is the concrete, checkable verification used here, consistent with how this session's other performance-finding changes (PERF-001, PERF-002) verified "boundedness" through behavioral tests rather than literal query-counting infrastructure.

## Migration Plan

No schema or data migration — purely an internal query-shape change to existing route handlers. No new dependency, no new error code, no response-shape change to any endpoint. Nothing to roll back beyond reverting the code change itself.
