## 1. Rate-limit config

- [x] 1.1 In `apps/api/src/plugins/rateLimit.ts`, add `WRITE_RATE_LIMIT` exporting `{ rateLimit: { max: 60, timeWindow: "1 hour", keyGenerator: (request) => request.session.userId ?? request.ip } }`, matching `SPEC.md`'s documented "60 writes/hour/user" tier. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes. (Typecheck clean.)

## 2. Apply the rate limit

- [x] 2.1 In `apps/api/src/routes/entries.ts`, add `{ config: WRITE_RATE_LIMIT }` to the entry-creation route, importing `WRITE_RATE_LIMIT` from `../plugins/rateLimit.js`. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes. (Typecheck clean.)
- [x] 2.2 In `apps/api/src/routes/entryEditProposals.ts`, add the same `{ config: WRITE_RATE_LIMIT }` to the edit-proposal-creation route. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes. (Typecheck clean.)

## 3. Cap the inflections array

- [x] 3.1 In `packages/shared/src/entries.ts`, add `.max(50, "...")` to the `inflections` array in `createEntrySchema`, matching the file's existing `.max(N, "message")` convention. Verify `pnpm --filter @planetos/shared exec tsc --noEmit` (or the relevant shared-package typecheck) passes. (Typecheck clean. Extracted a shared `MAX_INFLECTIONS = 50` constant + message so both schemas stay in sync.)
- [x] 3.2 Apply the same `.max(50, "...")` to `submitEntryEditProposalSchema`'s `inflections` array. Verify the typecheck passes. (Both `packages/shared` and `apps/api` typecheck clean.)

## 4. Tests — rate-limit bucketing

- [x] 4.1 In `apps/api/tests/rateLimit.test.ts`, add a test for `WRITE_RATE_LIMIT`'s user-keyed bucketing using the file's established `buildApp({ trustProxy, rateLimit: true })` + throwaway-route pattern with a small `max` override: two different simulated authenticated users behind the same client IP get independent budgets (both succeed up to their own limit), and the same user across different simulated IPs shares one budget (the second IP's requests count against the first's remaining budget). Verify the test passes against real Redis. (Implemented with real registered/logged-in users rather than simulated headers — proves the actual session-decoration-before-rate-limit-check hook ordering design.md relies on, not just the keyGenerator function in isolation. 3/3 tests pass live against real Postgres/Redis.)

## 5. Tests — inflection count cap

- [x] 5.1 In `apps/api/tests/entries.test.ts`, add a test: an entry-creation request with more than 50 inflections is rejected with a 400 validation error, and no `Entry`, `Inflection`, or `SeriesWord` row is created for it. Verify the test passes against real Postgres. (Discovered `packages/shared` ships from `dist/`, not source — `apps/api` won't see the schema change until `pnpm --filter @planetos/shared build` runs. Rebuilt; 39/39 tests pass. This rebuild step will need to happen once more before final verification if any further shared-package edits occur.)
- [x] 5.2 In `apps/api/tests/entryEditProposals.test.ts`, add the equivalent test for edit-proposal submission: more than 50 inflections is rejected with 400 and no `EntryEditProposal` or related row is created. Verify the test passes against real Postgres. (30/30 tests pass.)

## 6. Tests — rate limit wired to the real routes

- [x] 6.1 In `apps/api/tests/entries.test.ts`, add a test proving `WRITE_RATE_LIMIT` is actually wired to the real entry-creation route: make one authenticated, successful create-entry request and assert the response carries the `x-ratelimit-limit` header equal to `60` (the plugin's `addHeaders` config already exposes this on every rate-limited response) — this proves the route is under the write tier without needing to exhaust 60 real requests or wait out the window. Verify the test passes. (Used a dedicated `buildApp({ rateLimit: true })` instance since the file's shared top-level app doesn't register the rate-limit plugin. 40/40 tests pass.)

## 7. Verification

- [x] 7.1 `pnpm --filter @planetos/api exec tsc --noEmit` passes with all changes in place. (Clean, after a final `pnpm --filter @planetos/shared build`.)
- [x] 7.2 `pnpm --filter @planetos/api test rateLimit entries entryEditProposals` passes in full — existing tests plus all new tests — against real Postgres/Redis. (73/73 pass. Found and fixed a real bug in my own new tests along the way: they called `/api/auth/register` without a distinct simulated IP, so repeated test runs this session collided with the shared, IP-keyed, Redis-backed `REGISTRATION_RATE_LIMIT` bucket — not a bug in the implementation. Fixed by adding `trustProxy` + a timestamp-derived unique simulated IP to both new tests' register/login calls, matching this file's own established convention for avoiding cross-run budget leakage.)
- [x] 7.3 `openspec validate add-write-rate-limits --type change --strict` passes. (Passed: "Change 'add-write-rate-limits' is valid".)
- [x] 7.4 Read-through: confirm `series.ts` and the rebuild route in `downloads.ts` are unchanged and still `requireAdmin`-gated, so the admin exemption documented in design.md still holds. (Confirmed via `git status` — neither file appears as modified — and re-reading `series.ts`'s three routes, all still `requireAdmin`-gated.)
