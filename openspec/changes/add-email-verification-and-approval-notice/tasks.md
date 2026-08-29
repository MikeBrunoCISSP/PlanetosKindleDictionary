## 1. Backend: verification-token model, migration, and backfill

- [ ] 1.1 Add an `EmailVerificationToken` model to `apps/api/prisma/schema.prisma` (per design.md decision 1: `id`, `userId` + `user` relation with `onDelete: Cascade` from the start, `tokenHash` unique, `expiresAt`, `usedAt` nullable, `createdAt`, `@@index([userId])`). Generate the migration and hand-add the backfill statement `UPDATE "User" SET "emailVerified" = true WHERE "emailVerified" = false;` to the same migration file (per design.md decision 2; fall back to the established shadow-DB-diff workaround if blocked by the known checksum-mismatch issue). Verify `pnpm --filter api prisma migrate status` shows up to date, verify via `psql` that a pre-migration seeded account now has `emailVerified = true`, and confirm `pnpm --filter api test` (existing suite) still passes unaffected.
- [ ] 1.2 In `apps/api/prisma/seed.ts`, add `emailVerified: true` to both the `create` and `update` blocks of the admin upsert. Verify by re-running `pnpm --filter api seed` against the dev database and confirming the admin account's `emailVerified` is `true`.

## 2. Backend: mailer additions

- [ ] 2.1 In `apps/api/src/lib/mailer.ts`, add `sendVerificationEmail(to: string, verifyUrl: string): Promise<void>` (plain-text email with the verification link) and `sendAccountApprovedEmail(to: string): Promise<void>` (plain-text email informing the recipient their account was approved). Add tests in `apps/api/tests/lib/mailer.test.ts` for both, following the existing real-Mailpit pattern (send, then fetch and assert on the real received message). Verify with `pnpm --filter api test`.

## 3. Shared: resend-verification schema

- [ ] 3.1 Add `resendVerificationSchema` (`{ identifier: string, min 1 }`, matching `forgotPasswordSchema`'s shape) to `packages/shared/src/auth.ts`, exporting a `ResendVerificationDto` type. Add unit tests in `packages/shared/src/__tests__/auth.test.ts`. Verify with `pnpm --filter shared test`.

## 4. Backend: errors and rate limits

- [ ] 4.1 Add `EMAIL_NOT_VERIFIED: () => new DomainError("EMAIL_NOT_VERIFIED", "Please verify your email address before signing in.", 403)` and `INVALID_VERIFICATION_TOKEN: () => new DomainError("INVALID_VERIFICATION_TOKEN", "This verification link is invalid or has expired.", 400)` to `apps/api/src/lib/errors.ts`. Add `VERIFY_EMAIL_RATE_LIMIT = { max: 10, timeWindow: "15 minutes" }` and `RESEND_VERIFICATION_RATE_LIMIT = { max: 5, timeWindow: "1 hour" }` to `apps/api/src/plugins/rateLimit.ts`.

## 5. Backend: registration no longer opens a session

- [ ] 5.1 In `apps/api/src/routes/auth.ts`'s `POST /api/auth/register` handler: remove the `request.session.userId = user.id` / `request.session.save()` calls; after creating the user, generate a random token, hash it, create the `EmailVerificationToken` row (`expiresAt` = now + 24h), and send the verification email via `sendVerificationEmail` with a URL built from `PUBLIC_BASE_URL` + `/verify-email?token=...`. Response stays `201` with the same `UserDto` body. Update the existing registration tests in `apps/api/tests/auth.test.ts` that currently assert `res.headers["set-cookie"]` is defined on success — assert it is now `undefined` instead. Add a test confirming a real verification email is received via Mailpit after registration. Verify with `pnpm --filter api test`.

## 6. Backend: login requires a verified email

- [ ] 6.1 In the `POST /api/auth/login` handler, add `if (!user.emailVerified) throw Errors.EMAIL_NOT_VERIFIED();` immediately after the existing `isActive` check (per design.md decision 3 — same placement, before password verification). Add tests: an unverified account with correct credentials → `403` `EMAIL_NOT_VERIFIED`, no session cookie; a pre-existing (pre-migration-backfilled, i.e. seeded before this feature) account still logs in successfully without ever verifying. Verify with `pnpm --filter api test`.

## 7. Backend: verify-email endpoint

- [ ] 7.1 Implement `POST /api/auth/verify-email` in `auth.ts`, rate-limited with `VERIFY_EMAIL_RATE_LIMIT`: parse `{ token: string }`, hash it, look up an unused `EmailVerificationToken` by `tokenHash` with `expiresAt > now`; if none found throw `Errors.INVALID_VERIFICATION_TOKEN()`; otherwise set `user.emailVerified = true` and mark the token `usedAt = now` in one transaction, return `200` (no session established). Add tests: valid token verifies the account and a subsequent login succeeds; reused token → `400` `INVALID_VERIFICATION_TOKEN`; expired token (seed one with a past `expiresAt`) → same error; unknown/garbage token → same error. Verify with `pnpm --filter api test`.

## 8. Backend: resend-verification endpoint

- [ ] 8.1 Implement `POST /api/auth/resend-verification` in `auth.ts`, rate-limited with `RESEND_VERIFICATION_RATE_LIMIT`: parse `resendVerificationSchema`, look up the user by normalized username or email; only if found, `isActive`, and `!emailVerified`, invalidate that account's prior unused `EmailVerificationToken` rows, issue a new one, and send the verification email. Always respond `200` with the same generic message regardless of match. Add tests: matching unverified active account → real email received via Mailpit, generic response; already-verified account → generic response, no email sent; unknown identifier → generic response, no email sent; disabled account → generic response, no email sent; a token issued before a resend is no longer redeemable after the resend issues a new one. Verify with `pnpm --filter api test`.

## 9. Backend: approval notification email

- [ ] 9.1 In `apps/api/src/routes/admin.ts`'s `POST /api/admin/users/:id/approve` handler, after the `approvalStatus` update succeeds, call `sendAccountApprovedEmail(user's email)` wrapped in try/catch that logs on failure without rethrowing (per design.md decision 6). Add tests: approving a pending user sends a real email (verified via Mailpit) and the approval still returns its existing success response; simulate a send failure (e.g. inject a storage/mailer double that throws, matching the existing `BuildStorage`-style injected-failure test pattern from the Kindle automation change) and confirm the approval still succeeds with `approvalStatus: "APPROVED"` in the response despite the failure. Verify with `pnpm --filter api test`.

## 10. Frontend: registration success screen

- [ ] 10.1 In `apps/web/src/routes/login.tsx`'s `RegisterForm`, change the submit handler to stop calling `queryClient.setQueryData(ME_QUERY_KEY, user)` and stop navigating to `/` on success; instead render an inline "Check your email to verify your account" success card (mirroring `ForgotPasswordForm`'s existing success-card pattern) with a "Resend verification email" action that calls `apiResendVerification({ identifier: <the email just submitted> })`. Add `apiResendVerification` to `apps/web/src/lib/api.ts`. Verify by registering a new account and confirming: no redirect to `/`, the header still shows "Log In" (no session), the success card appears, and clicking resend triggers a second real email (visible in Mailpit).

## 11. Frontend: login surfaces the resend action on an unverified-email error

- [ ] 11.1 In `SignInForm`, detect the `EMAIL_NOT_VERIFIED` error type on a failed login and show a distinct inline message with a "Resend verification email" action using the identifier already typed into the form (reusing `apiResendVerification`). Verify by attempting to log into an unverified account and confirming the distinct message and working resend action appear, while a plain wrong-password attempt still shows the existing generic message unchanged.

## 12. Frontend: verify-email page

- [ ] 12.1 Create `apps/web/src/routes/verify-email.tsx`: reads `token` from the URL search params, calls `apiVerifyEmail({ token })` on mount, and shows a success state (with a link to `/login`) or a clear "invalid or expired" state (with a link to resend, reusing the same resend action) depending on the result. Add `apiVerifyEmail` to `api.ts`. Verify `pnpm --filter web exec vite build` regenerates `routeTree.gen.ts` with the new `/verify-email` route present.
- [ ] 12.2 Run `pnpm --filter web lint` and `pnpm --filter web exec tsc --noEmit`; confirm both pass clean.

## 13. Documentation

- [ ] 13.1 Update `SPEC.md` §6 (HTTP API) — confirm `POST /api/auth/verify-email` now matches what was actually built, and add `POST /api/auth/resend-verification` alongside it.
- [ ] 13.2 Update `SPEC.md` §8 (Frontend > Routes) to add `/verify-email`.

## 14. End-to-end verification

- [ ] 14.1 Run `pnpm --filter api test`, `pnpm --filter shared test`, `pnpm --recursive typecheck`, `pnpm --filter api lint`, `pnpm --filter web lint`, and `pnpm --filter web build`; confirm all succeed.
- [ ] 14.2 Manually verify against the real running dev stack: register a new throwaway account and confirm no session is opened and a real verification email arrives via Mailpit; attempt to log in before verifying and confirm the distinct "please verify" error with a working resend action; click the (possibly resent) verification link and confirm the account becomes verified and can then log in normally; confirm the pre-existing seeded admin account logs in without ever needing to verify; as admin, approve a different pending throwaway registration and confirm that user receives a real approval-notification email via Mailpit. Clean up all throwaway accounts created during this walkthrough afterward.
