## Context

See proposal.md - Why for motivation. This builds directly on two things already in the codebase: the new-entry submission/approval workflow (`Entry.approvalStatus`, the `/admin/entries/*` routes, `admin_.approval-queue.tsx`) and the search feature (`GET /api/search`, `SeriesWord` word-uniqueness). It also has to avoid conflating two existing models that sound similar but aren't: `Revision` is an append-only **audit log** of things that already happened (written inside the same transaction as the change it records); this feature needs a **staging area for a not-yet-applied proposal**, which is a different kind of thing entirely.

Two decisions were made with you directly rather than inferred, since the source spec (P:\_temp\viewAndEdit.md) didn't cover them:
- An entry that's Pending its first review is **visible** on its detail page (to anyone, with a "pending review" indicator) rather than 404ing.
- Rejected and soft-Deleted entries **do** 404 on the detail page — only Pending gets the visible-with-banner treatment.

## Goals / Non-Goals

**Goals:**
- Let anyone view a single entry's full content, reached from search.
- Let any authenticated user propose a Definition/Inflection change to an approved entry, without ever touching the live entry until an admin approves it.
- Reuse the existing approval-queue UI, duplicate-word rules, and Prisma/transaction conventions rather than building parallel versions of any of them.
- Make the concurrency and re-validation guarantees real (DB-enforced), not just client-side.

**Non-Goals** (explicit per the source spec's own scope list): editing Headwords; deleting entries; revision-history UI for normal users; comparing/restoring historical revisions; user-editing of rejected proposals; auto-merging conflicting proposals; more than one Pending proposal per entry; an admin bypass of the approval workflow; email/notifications.

## Decisions

**New model name: `EntryEditProposal`, with its own `EntryEditProposalStatus` enum** (not a reuse of `EntryApprovalStatus`). Same reasoning already established in this codebase for `UserApprovalStatus` vs. `EntryApprovalStatus`: two different lifecycles that happen to share a value set (Pending/Approved/Rejected) shouldn't share an enum, since they're conceptually unrelated things being reviewed.

```prisma
enum EntryEditProposalStatus {
  PENDING
  APPROVED
  REJECTED
}

model EntryEditProposal {
  id                     String                  @id @default(cuid())
  entryId                String
  entry                  Entry                   @relation(fields: [entryId], references: [id], onDelete: Cascade)
  proposedDefinitionHtml String                  // sanitized at submission time, same as Entry.definitionHtml
  status                 EntryEditProposalStatus @default(PENDING)
  submittedById          String?
  submittedBy            User?                   @relation("EntryEditProposalSubmittedBy", fields: [submittedById], references: [id], onDelete: SetNull)
  reviewedById           String?
  reviewedBy             User?                   @relation("EntryEditProposalReviewedBy", fields: [reviewedById], references: [id], onDelete: SetNull)
  reviewedAt             DateTime?
  rejectionNote          String?
  // Entry.updatedAt captured server-side at submission time - the optimistic-
  // concurrency token checked at approval time. Never client-supplied.
  baseEntryUpdatedAt     DateTime
  createdAt              DateTime                @default(now())
  inflections            EntryEditProposalInflection[]

  @@index([status, createdAt])
  @@index([entryId])
}

model EntryEditProposalInflection {
  id         String            @id @default(cuid())
  proposalId String
  proposal   EntryEditProposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  value      String

  @@index([proposalId])
}
```
`User` gains `submittedEntryEditProposals`/`reviewedEntryEditProposals` relation fields, mirroring the existing `submittedEntries`/`reviewedEntries` naming and nullable-`SetNull` convention.

**Proposed inflections are stored as the final desired list, not a diff of add/remove operations.** The review UI computes current-vs-proposed by diffing the proposal's stored list against the entry's *live* inflections at render time; at approval time, once the concurrency check confirms the entry hasn't moved, that diff is guaranteed accurate, so applying it (delete what's missing, create what's new) is safe. Storing ops instead would add complexity for no benefit, since the end state is always what's wanted.

**Concurrency token: `Entry.updatedAt` itself, captured server-side at submission.** `Entry` already has `updatedAt @updatedAt`; no new version column is needed. The submit-edit endpoint reads the entry's current `updatedAt` inside its own transaction and stores it as `baseEntryUpdatedAt` — never accepted from the client, satisfying "do not rely on a client-side version comparison" directly. **Required discipline**: `@updatedAt` only bumps on an explicit `.update()` against the `Entry` row itself, not from child `Inflection`/`SeriesWord` writes. The approval transaction must therefore *always* call `tx.entry.update()` on the Entry row (setting `definitionHtml`, even when it's unchanged) so `updatedAt` reliably advances on every approval — exactly what the existing new-entry approve/reject endpoints already do today, so this preserves an existing invariant rather than introducing a new one. This is a load-bearing detail: a future code path that mutates entry content without going through `tx.entry.update()` would silently break stale-revision detection.

**One Pending proposal per entry: application check + a hand-added Postgres partial unique index.** Prisma's schema DSL has no partial/conditional index syntax, so — matching the two prior occasions this project has hand-edited a generated `migration.sql` (the pg_trgm GIN index, and an earlier column-rename that needed non-interactive-safe SQL) — the migration adds:
```sql
CREATE UNIQUE INDEX "EntryEditProposal_entryId_pending_unique"
  ON "EntryEditProposal" ("entryId")
  WHERE "status" = 'PENDING';
```
The application-level check (query for an existing Pending proposal before creating a new one) gives a clean error message in the common case; the index is the actual race-safety backstop, caught as a P2002 on the rare concurrent-submission race, mirroring exactly how `SeriesWord`'s unique constraint already backstops concurrent new-entry submissions today.

**Approval is one Prisma transaction**, `Serializable` isolation (matching the existing create/approve/reject transactions):
1. Load the proposal (with its inflections) and the target entry; 404 if either is missing.
2. If the proposal isn't `PENDING`, fail with `ALREADY_REVIEWED` (reused as-is).
3. If `entry.updatedAt !== proposal.baseEntryUpdatedAt`, fail with the new `STALE_ENTRY_REVISION` — proposal stays Pending, nothing is written.
4. Re-run word-uniqueness: for each proposed inflection value that's genuinely new (not already one of the entry's current inflections), check it against every *other* entry's `SeriesWord` rows in the same dictionary; a hit fails with `DUPLICATE_WORD` (reused) — proposal stays Pending.
5. Diff current vs. proposed inflections (normalized-value compare) into `toAdd`/`toRemove`.
6. `tx.entry.update()` with the proposed `definitionHtml` (always executed, per the concurrency-token discipline above).
7. Delete `toRemove` inflections (cascades their `SeriesWord` row); create `toAdd` inflections + their `SeriesWord` rows — a P2002 here (a word claimed in the gap between step 4's check and this insert) is the final DB-level backstop, caught and re-thrown as `DUPLICATE_WORD`, rolling back the whole transaction so the proposal stays Pending.
8. Mark the proposal `APPROVED` with reviewer/timestamp.
9. Write one audit `Revision` row (`action: "UPDATE"`) reflecting the entry's new state — matching the existing pattern where every entry mutation gets an audit row.

Rejecting an edit proposal does **not** write a `Revision` audit row: nothing happened to the `Entry`, and `Revision` only records things that happened to an `Entry`.

**Public entry-detail visibility rule** (per your direction): `GET /api/entries/:id` returns the entry when `status === PUBLISHED` and `approvalStatus` is `APPROVED` or `PENDING`; it 404s when `approvalStatus === REJECTED` or `status === DELETED`. The response DTO includes `approvalStatus` so the frontend can render the "pending review" banner, but is otherwise a leaner `PublicEntryDto` than the admin `EntryDto` — no `submittedById`/`reviewedById`/`reviewedAt`/`rejectionNote`, keeping review-internal fields out of a page anonymous visitors can load. It also includes `seriesSlug`, needed for the edit-mode duplicate-check (below).

**Edit-button and edit-submission are additionally gated on `approvalStatus === APPROVED`** (on top of the source spec's own authentication-only matrix for this feature). Editing a not-yet-approved entry isn't mentioned anywhere in the source spec — every section describing edits assumes an already-approved base — so this is treated as an implicit scope boundary, not a rule the doc stated and I loosened. `POST /api/entries/:id/edit-proposals` 404s (not 403s) for a non-Approved entry, consistent with how a Pending entry already reads as "not fully there yet" elsewhere.

**Backend routes** — new file `apps/api/src/routes/entryEditProposals.ts` for the proposal-specific endpoints, keeping `entries.ts` scoped to `Entry` itself (it's already handling three trust levels: public create-adjacent, `requireAuth`, `requireAdmin` — adding a fourth concern would make it unwieldy). The public detail GET stays in `entries.ts` since it's about `Entry`, not proposals.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/entries/:id` | none | 404 per the visibility rule above |
| POST | `/api/entries/:id/edit-proposals` | `requireAuth` (not `requireApproved` — deliberate, matches the source spec's authorization matrix, which is looser here than entry-creation's tier) | `{ definitionHtml, inflections: string[] }`; 404 if entry missing/not-Approved; 409 `DUPLICATE_WORD`; 409 `EDIT_ALREADY_PENDING` |
| GET | `/api/admin/review-queue` | `requireAdmin` | merged, oldest-first; replaces the Approval Queue UI's use of `/api/admin/entries/pending` (that endpoint itself is untouched, for any other caller) |
| GET | `/api/admin/entry-edit-proposals/:id` | `requireAdmin` | current (fetched live) + proposed, for the review dialog |
| POST | `/api/admin/entry-edit-proposals/:id/approve` | `requireAdmin` | transaction above |
| POST | `/api/admin/entry-edit-proposals/:id/reject` | `requireAdmin` | `{ note? }` |

**Merged queue is one server-side endpoint**, not two lists merged client-side — the source spec explicitly wants "one place... not a second, parallel approval UI," and a single endpoint enforces that architecturally. Implementation: two small `findMany`s (Pending new entries; Pending proposals, `include`-ing the parent entry's headword), mapped to a common discriminated shape and merge-sorted by timestamp in application code:
```ts
type PendingQueueItemDto =
  | { type: "NEW_ENTRY"; id: string; headword: string; createdAt: string }
  | { type: "EDIT"; id: string; entryId: string; headword: string; createdAt: string };
```
A `$queryRaw UNION ALL` would be the natural upgrade if the queue ever needs pagination; not warranted at today's scale.

**New errors** in `apps/api/src/lib/errors.ts`:
```ts
EDIT_ALREADY_PENDING: () => new DomainError("EDIT_ALREADY_PENDING", "An edit for this entry is already awaiting approval.", 409),
STALE_ENTRY_REVISION: () => new DomainError("STALE_ENTRY_REVISION", "This entry has changed since this edit was submitted. Please review the current entry before approving.", 409),
```
`DUPLICATE_WORD` and `ALREADY_REVIEWED` are reused as-is.

**Shared package**: factor a trimmed `definitionHtmlSchema` out of `createEntrySchema`, reused by the new `submitEntryEditProposalSchema`:
```ts
export const definitionHtmlSchema = z.string().trim().min(1, "Definition is required").max(5000, "Definition must be at most 5,000 characters");
```
This closes a real gap (today's `definitionHtml` field has no `.trim()`, unlike every `plainText()`-based field, so a whitespace-only Definition currently passes `.min(1)`) as a side effect of doing the DRY thing the source spec already asks for ("same rules as entry creation"). Low-risk: it only makes an already-intended-to-be-required field correctly reject whitespace, doesn't change the length ceiling, and closes a gap of the same shape already fixed once before in this codebase (`plainText()` itself gained the identical `.trim()` fix in an earlier change). `submitEntryEditProposalSchema` has no `headword` field at all — the route determines the target entry's headword server-side and does the headword-vs-inflection check there, since headword isn't submitted.

Also promote the existing module-local `DUPLICATE_WORD_MESSAGE` (in `packages/shared/src/entries.ts`) to `export const`, and have `entries/new.tsx`'s independently-duplicated copy of the same literal import it instead. Small, but this feature needs the exact same string in a third place (the edit UI), and three independently-typed copies of one user-facing string is exactly the kind of thing that quietly drifts.

**Frontend: `apps/web/src/routes/entries/$id.tsx`**, flat under `entries/` (matching `entries/new.tsx`/`entries/delete.tsx`), **no `beforeLoad` redirect** — this is the one entry-adjacent route that must render for anonymous visitors, so auth state comes from an in-component `useQuery(["auth","me"], apiMe)` used only to conditionally show the Edit button, not to gate the route. One component toggling `mode: "view" | "edit"` locally rather than two components, since both modes share the same entry fetch and the same "what's the current approved state" source of truth that dirty-tracking depends on.

**Dirty-tracking does not rely on react-hook-form's built-in `formState.isDirty`**, which compares raw string equality to `defaultValues` rather than normalized-value equality and so can't reliably distinguish "retyped the same text with different incidental whitespace" from a real edit. Instead: capture a normalized baseline (`{ definition: normalize(definitionHtml), inflections: sortedNormalizedValues }`) in a ref when entering edit mode, and compute `isReallyDirty` explicitly via `watch()` against that baseline. This directly satisfies "focus-then-blur without a real edit must not dirty the form."

**Inflection self-exclusion needs no backend change.** The existing `GET /api/series/:slug/entries/words` stays as-is. The edit page already knows this entry's own headword and current inflection values from the detail payload itself, so it fetches the full dictionary word list (same as Add Entry does) and locally subtracts its own already-known words before building the duplicate-check set — structurally excluding the entry's own unchanged inflections from ever flagging themselves. This needs `seriesSlug` on the public entry DTO (already included above) to know which dictionary's word list to fetch.

**Review dialog: a new sibling component, `EntryEditProposalDetailsDialog`, not an extension of the existing `EntryDetailsDialog`.** They fetch different things and render a fundamentally different (two-sided current-vs-proposed) layout; the Approval Queue's row click dispatches to one or the other based on `item.type`, keeping one table/one set of row controls while letting each dialog's internals differ. Diffing is plain JS set arithmetic (`added = proposed - current`, `removed = current - proposed`, normalized), rendered as differently-styled `Badge`s — no diff library, per the source spec's own explicit guidance.

## Risks / Trade-offs

- [The partial unique index lives only in hand-authored `migration.sql`, invisible to `schema.prisma`] → Same accepted cost as the two prior hand-authored migrations in this project; documented via a comment on the model pointing at the migration.
- [`Entry.updatedAt`-as-concurrency-token depends on every entry-mutating code path routing through an explicit `tx.entry.update()`] → Already true of every existing entry-mutating endpoint; call out via a comment on the `updatedAt` field itself so it's not accidentally broken later.
- [Timestamp-equality (not a monotonic counter) is a slightly coarse concurrency check] → `timestamptz(3)` millisecond precision round-trips reliably through Prisma/Postgres; still worth a direct integration test rather than assuming it.
- [Treating "entry isn't Approved" as a 404 rather than 403 on both the detail page and edit-submission] → Consistent with the existing pattern of not revealing the existence/state of something the requester isn't meant to see (mirrors how login failures don't reveal whether an account exists).
- [Two new near-identically-named requirements — "Approving an Edit Proposal" vs. the existing "Approving an Entry" — in the same `entries/approval` spec] → Deliberately distinct titles to avoid being skimmed past each other during review.
- [The self-exclusion duplicate-check depends on the entry's own known words matching byte-for-byte what the flat words-list endpoint would also return] → True by construction (same underlying data), but this is the source spec's most emphasized edge case — gets a dedicated integration test, not just incidental coverage.
