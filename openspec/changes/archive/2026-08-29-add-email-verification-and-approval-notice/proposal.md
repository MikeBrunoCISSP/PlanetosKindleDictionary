## Why

There are two gaps in how users learn about and are trusted by their own account state: anyone can register with an email address they don't own and log straight in (nothing ever confirms it's really theirs), and once an admin approves a pending registration, the user has no way to know except by trying to log in and noticing new things work.

## What Changes

- Registration sends a verification email instead of opening a session immediately. The account can't log in until that link is clicked.
- Add `POST /api/auth/verify-email` (already anticipated in `SPEC.md`, never built) to redeem the link, and a new `/verify-email` frontend page to land on it.
- Add a "resend verification email" capability (`POST /api/auth/resend-verification`), reachable from both the post-registration confirmation screen and from a failed login caused by an unverified email — without it, anyone who loses the first email is permanently locked out.
- `POST /api/auth/login` rejects an unverified account with a distinct, clear error (not the generic invalid-credentials message) and does not open a session.
- **Existing accounts are grandfathered in**: a one-time migration marks every account that exists before this change ships as already verified, so nobody currently able to log in — including the seeded admin — loses access. Only newly-registered accounts face the verification gate.
- When an administrator approves a pending user's registration (`POST /api/admin/users/:id/approve`), the system emails that user to let them know — a failed send never blocks the approval itself from succeeding.

## Capabilities

### New Capabilities

(none — this extends two existing capabilities)

### Modified Capabilities

- `auth/login-registration`: registration no longer auto-opens a session and now sends a verification email; login rejects unverified accounts; adds email verification redemption and resend.
- `admin/user-management`: approving a pending registration now sends the approved user a notification email.

## Impact

- **Backend**: new `EmailVerificationToken` Prisma model + migration (including the grandfather-existing-accounts backfill), `apps/api/src/routes/auth.ts` (registration no longer opens a session, new `verify-email`/`resend-verification` routes, login gains the verified-email check), `apps/api/src/lib/mailer.ts` (two new email functions), `apps/api/src/routes/admin.ts` (send notification on approval), `apps/api/src/plugins/rateLimit.ts` (two new tiers), `apps/api/src/lib/errors.ts` (two new domain errors), `apps/api/prisma/seed.ts` (admin account seeded as already verified).
- **Frontend**: `apps/web/src/routes/login.tsx` (registration success screen changes from auto-redirect to a "check your email" card with a resend action; Sign In form surfaces a resend action when login fails specifically because the email isn't verified), new `apps/web/src/routes/verify-email.tsx`.
- **Shared**: new `resendVerificationSchema` in `packages/shared/src/auth.ts`.
- **Specs**: `openspec/specs/auth/login-registration/spec.md`, `openspec/specs/admin/user-management/spec.md`.
