## 1. Fix password-reset token consumption

- [x] 1.1 In `apps/api/src/routes/auth.ts`'s `reset-password` handler, convert the array-form `prisma.$transaction([...])` to interactive form (`prisma.$transaction(async (tx) => {...})`). Replace the token's `update({ where: { id: resetToken.id } })` with `updateMany({ where: { id: resetToken.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } })`; throw `Errors.INVALID_RESET_TOKEN()` if `count !== 1`; only then update the user's password inside the same transaction. Add a comment on the `updateMany`'s `where` clause explaining it's the load-bearing atomic claim (SEC-002), not decorative. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes. (Typecheck clean.)

## 2. Fix email-verification token consumption

- [x] 2.1 Apply the identical pattern to the `verify-email` handler: interactive transaction, `emailVerificationToken.updateMany({ where: { id: verificationToken.id, usedAt: null, expiresAt: { gt: new Date() } }, ... })`, throw `Errors.INVALID_VERIFICATION_TOKEN()` if `count !== 1`, then `emailVerified: true` inside the same transaction. Same load-bearing comment. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes. (Typecheck clean.)

## 3. Concurrent-request tests

- [x] 3.1 In `apps/api/tests/passwordReset.test.ts`, add a test: obtain one valid reset token, fire two `resetPassword(token, ...)` requests concurrently via `Promise.all` with two different new passwords, assert exactly one resolves 200 and the other resolves 400 with the existing `invalid-reset-token` problem type, and assert login succeeds only with the winning request's password (not the losing one, not the original). Verify the test passes against real Postgres. (Passing consistently across 5 consecutive runs, 11/11 each time.)
- [x] 3.2 In `apps/api/tests/emailVerification.test.ts`, add the equivalent test: one valid verification token, two concurrent `verify-email` requests, assert exactly one resolves 200 and the other 400 with `invalid-verification-token`, and assert the account's `emailVerified` ends up `true` (checked once, not asserting on how many times it was internally set). Verify the test passes against real Postgres. (Passing consistently across 5 consecutive runs, 10/10 each time.)

## 4. Verification

- [x] 4.1 `pnpm --filter @planetos/api exec tsc --noEmit` passes with all changes in place. (Clean.)
- [x] 4.2 `pnpm --filter @planetos/api test passwordReset.test.ts emailVerification.test.ts` passes in full — all existing sequential tests plus the two new concurrent tests — against real Postgres. (21/21 pass.)
- [x] 4.3 `openspec validate fix-token-consumption-race --type change --strict` passes. (Passed: "Change 'fix-token-consumption-race' is valid".)
- [x] 4.4 Read-through: confirm both `updateMany` calls' `where` clauses match design.md exactly (id + usedAt:null + expiresAt gt fresh timestamp) and that the pre-transaction `findFirst` reads are otherwise untouched. (Confirmed — both match design.md exactly; both pre-transaction `findFirst` reads unchanged.)
