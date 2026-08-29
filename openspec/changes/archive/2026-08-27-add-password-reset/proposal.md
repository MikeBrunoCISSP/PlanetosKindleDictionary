## Why

There is no way for a user who forgets their password to recover their account today — SPEC.md anticipates `POST /api/auth/forgot-password` and `POST /api/auth/reset-password`, and `.env.example` already anticipates an `SMTP_URL`, but neither the email-sending infrastructure nor the routes exist. The user now has a real SMTP relay (Brevo) provisioned, making this the right time to build it.

## What Changes

- Add a "Forgot Password?" link on the `/login` page's Sign In form, leading to a new form that asks for username or email.
- Submitting that form always shows the same generic confirmation message, regardless of whether an account was found — no account enumeration via this flow.
- If a matching, active account is found, the system emails it a single-use, time-limited reset link.
- Add a `/reset-password` page (reached via the emailed link) where the user sets a new password meeting the existing complexity rules; on success they're sent to `/login` to sign in with it.
- Add real SMTP sending via `nodemailer`, configured through the already-anticipated `SMTP_URL` env var — usable both locally (against a new local test-catcher) and in production (Railway env vars, pointing at Brevo). No real credential is written into any repo file as part of this change.
- Add a local Mailpit service to `infra/docker-compose.yml` so `apps/api` tests can send and verify real emails, matching this project's established real-services testing convention.
- **Housekeeping (unrelated to email, but a prerequisite before any real third-party secret is put in an env file)**: untrack `.env` from git (`git rm --cached`, add to `.gitignore`) — it is currently committed, and the Brevo credential must never land in git history.

## Capabilities

### New Capabilities

(none — this extends the existing auth capability)

### Modified Capabilities

- `auth/login-registration`: adds forgot-password request, reset-token redemption, and the reset-password page; extends the combined login-page requirement with a third mode.

## Impact

- **Backend**: new `apps/api/src/routes/auth.ts` handlers (`POST /api/auth/forgot-password`, `POST /api/auth/reset-password`), a new `PasswordResetToken` Prisma model + migration, a new `apps/api/src/lib/mailer.ts` (nodemailer), a new rate-limit tier, two new `DomainError`s.
- **Frontend**: `apps/web/src/routes/login.tsx` (new "Forgot Password?" link + form, extended `mode` search schema), new `apps/web/src/routes/reset-password.tsx`.
- **Shared**: new `forgotPasswordSchema`/`resetPasswordSchema` in `packages/shared/src/auth.ts`.
- **Infra**: `infra/docker-compose.yml` (new Mailpit service), `.env.example` (SMTP_URL usage clarified), `.gitignore` (add `.env`), git index (untrack `.env`).
- **Specs**: `openspec/specs/auth/login-registration/spec.md`.
