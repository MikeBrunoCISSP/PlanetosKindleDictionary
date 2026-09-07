## Why

`SPEC.md` already documents "60 writes/hour/user" as part of the rate-limit
conventions, but no user-keyed rate-limit config exists anywhere in the
code — only IP-keyed configs for auth and search. Entry creation and
edit-proposal creation (the latter reachable by unapproved/PENDING users)
have no rate limit at all, and their shared `inflections` schema field has
no array-length cap, so a single request can trigger a large number of
sequential database writes inside an already-open transaction before
anything rejects it (finding SEC-003, medium severity, confirmed accurate).

## What Changes

- A new `WRITE_RATE_LIMIT` config (60/hour, keyed by the authenticated
  user's session id, falling back to IP for the unauthenticated case) is
  applied to entry creation and edit-proposal creation — the two
  non-admin-gated mutation routes the finding identifies. Series
  create/update/delete and the manual-rebuild route are confirmed
  `requireAdmin`-gated and are explicitly exempted, not silently skipped.
- `inflections` array fields in both `createEntrySchema` and
  `submitEntryEditProposalSchema` (`packages/shared/src/entries.ts`) gain a
  `.max(50)` cap, matching this file's existing length-cap convention.
  Because both routes already validate the request body against these
  schemas before doing anything else, this rejection happens before any
  database transaction opens — no separate pre-check needed.
- New tests: the rate-limit config buckets by user identity, not IP; an
  oversized `inflections` array is rejected with zero database rows
  created; exceeding the write limit on a real route returns 429.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `entries/submission`: entry creation gains an explicit per-user rate
  limit and a finite `inflections` cap (the delta covers whichever
  capability currently documents entry creation's request-validation
  behavior — confirmed exact path during specs artifact creation).
- `entries/editing`: edit-proposal submission gains the same rate limit and
  cap.

## Impact

- `apps/api/src/plugins/rateLimit.ts` — new `WRITE_RATE_LIMIT` export.
- `apps/api/src/routes/entries.ts`, `apps/api/src/routes/entryEditProposals.ts`
  — the new config applied to their creation routes.
- `packages/shared/src/entries.ts` — `.max(50)` on both `inflections`
  fields.
- `apps/api/tests/rateLimit.test.ts` and the entries/edit-proposals test
  files — new tests.
- No change to `apps/api/src/routes/series.ts` or the rebuild route in
  `apps/api/src/routes/downloads.ts` — both are admin-only and out of
  scope for this change (confirmed by reading their `preHandler`s).
- No change to `SPEC.md` — its existing "60 writes/hour/user" line already
  describes the target state.
