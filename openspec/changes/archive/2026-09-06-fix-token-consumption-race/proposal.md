## Why

Both `POST /api/auth/reset-password` and `POST /api/auth/verify-email` read
a token (`findFirst` checking `usedAt: null` and expiry), then separately
update it by primary key with no `usedAt: null` guard on that update. Two
concurrent requests carrying the same token both pass the read and both
commit: for password reset, the last commit's password silently wins,
meaning a link nominally described as single-use can set two different
passwords; for verification the effect is less severe (idempotent) but the
same single-use invariant is violated either way (finding SEC-002, medium
severity, confirmed accurate by reading the current code).

## What Changes

- Both endpoints' token consumption becomes an atomic claim: inside an
  interactive transaction, an `updateMany` re-checks `usedAt: null` and a
  fresh expiry against the token's id, and the user is only updated if
  exactly one row was claimed. A losing concurrent request gets the same
  generic invalid-token error it would get for a genuinely expired or
  already-used token.
- No new dependency, no schema change, no change to the pre-transaction
  fast-fail read (kept as-is; it's now an optimization, not the security
  boundary).
- New concurrent-request tests for both endpoints, proving exactly one of
  two simultaneous requests with the same token succeeds.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `auth/login-registration`: "Password Reset Token Redemption" and "Email
  Verification" each gain a scenario covering concurrent redemption
  attempts with the same token; their existing scenarios are unchanged.

## Impact

- `apps/api/src/routes/auth.ts` — the `reset-password` and `verify-email`
  handlers' transaction shape.
- `apps/api/tests/passwordReset.test.ts`, `apps/api/tests/emailVerification.test.ts`
  — new concurrent-request tests.
- No changes to `apps/api/prisma/schema.prisma`, `forgot-password`, or
  `resend-verification` (token *creation* isn't part of this race).
