## Why

Entry creation and edit-proposal approval each loop over an entry's inflections and issue one `Inflection` insert plus one `SeriesWord` insert per inflection (and a separate delete per removed inflection during proposal approval) — two or more sequential database round trips per inflection, growing transaction duration linearly with inflection count even after count caps (SEC-003) bound the maximum. A finding from an external review (PERF-003) flags this and requires round trips to stop growing linearly with inflection count while preserving the existing race-safe uniqueness guarantee and transactional atomicity.

## What Changes

- `POST /api/series/:slug/entries`'s per-inflection `Inflection.create` + `SeriesWord.create` loop is replaced with one batched `Inflection.createManyAndReturn` followed by one batched `SeriesWord.createMany` covering the headword's own row and every inflection's row — a fixed small number of round trips regardless of inflection count.
- `entryEditProposals.ts`'s shared `applyEditProposalToEntry` (used by both admin edit-proposal-approval routes) gets the same treatment: removed inflections are deleted via one batched `Inflection.deleteMany`, and added inflections use the same two-phase `createManyAndReturn` + `createMany` pattern as above.
- Also included, in the same file, same fix pattern, zero behavior change: the edit-proposal *submission* handler's nested `EntryEditProposalInflection` writes switch from a nested array `create` (which Prisma does not batch) to a nested `createMany` (which it does).
- No change to what data is created, what counts as a duplicate word, the transaction boundaries, the isolation level, or the existing `P2002 → 409 DUPLICATE_WORD` error mapping — only how the writes are batched.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none — this is a pure internal query-shape change; the existing word-uniqueness requirement in `entries/submission` already describes the *outcome*, not the mechanism, and that outcome is unchanged. `skip_specs: true` is set in this change's `.openspec.yaml`.)

## Impact

- `apps/api/src/routes/entries.ts` — batch the create-entry inflection writes.
- `apps/api/src/routes/entryEditProposals.ts` — batch `applyEditProposalToEntry`'s add/remove writes and the proposal-submission nested write.
- `apps/api/tests/entries.test.ts`, `apps/api/tests/entryEditProposals.test.ts` — existing multi-inflection and duplicate-word-race tests re-verified against the batched code path; no new test files expected.
