## Context

`SPEC.md` §6 already documents `POST /api/auth/forgot-password { email }` and `POST /api/auth/reset-password { token, password }`, and `.env.example` already anticipates `PUBLIC_BASE_URL` ("used for CORS and email links") and `SMTP_URL` ("SMTP connection URL for verification and password-reset emails") — but none of it is built: no mail library, no reset-token model, no routes, no frontend forms. This is greenfield, same situation as the Kindle-dictionary-automation and downloads-page changes earlier in this project's history.

The user's forgot-password request differs from `SPEC.md`'s literal `{ email }` in one way: it must accept **username or email** (`identifier`), matching how `POST /api/auth/login` already works (`loginSchema`'s `identifier` field). This design follows the user's explicit request and the login route's precedent; `SPEC.md` §6 is corrected as part of this change's docs task.

`apps/api/src/routes/auth.ts`'s existing `login` handler is the closest precedent for everything here: it already treats "account not found" and "account disabled" as needing generic, non-distinguishing responses (`INVALID_CREDENTIALS` covers both unknown identifier and wrong password), and it already gates on `isActive` but not `approvalStatus`. Password reset request-handling reuses that exact same `isActive`-only gating for consistency: whether an account is `PENDING` approval doesn't affect whether it can reset its own password (login itself isn't blocked by approval status either), but a disabled (`isActive = false`) account is treated as a non-match, same as login.

A real, unrelated finding surfaced while planning this change: `.env` is currently tracked by git in this repo (two prior commits touch it). Its current contents are harmless local-only dev placeholders (`minioadmin`, a local admin password), but this change is about to introduce a real, live third-party credential (a Brevo SMTP key) into local dev configuration for the first time — the user confirmed via a clarifying question that `.env` should be untracked now, before that happens.

## Goals / Non-Goals

**Goals:**
- Users who forget their password can recover their account via email, without account enumeration at any step.
- The real Brevo SMTP credential is usable in production (Railway env vars) and never appears in any file committed to this repo.
- Local development and `apps/api` tests exercise a real SMTP send/receive path, per this project's established real-services testing convention — not mocked.

**Non-Goals:**
- Email verification (`POST /api/auth/verify-email`, `emailVerified`) — also unimplemented, also documented in `SPEC.md`, but a separate concern from password reset. Not touched here.
- Invalidating a user's other active sessions when their password is reset. `@fastify/session` + `connect-redis` here has no existing session-store index by user id, and adding one is real new scope the user didn't ask for. A reset password takes effect for future logins; existing sessions elsewhere are unaffected.
- HTML email templating/branding — a plain-text (or minimally-formatted) email with the reset link is sufficient for this change.
- Retrying failed SMTP sends. The forgot-password response is generic and identical regardless of send success, so a transient SMTP failure just means the user doesn't receive that particular email and would need to submit the form again — acceptable for this change's scope; no job queue involvement.

## Decisions

### 1. `SMTP_URL` single connection string, not split vars

Nodemailer's `createTransport(url)` accepts `smtp://user:pass@host:port` directly, and this exact env var is already anticipated in `.env.example` (unused today). Reusing it matches the project's existing convention for `DATABASE_URL`/`REDIS_URL` (single connection string) rather than introducing a parallel `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD` set. The one wrinkle: the Brevo login (`b6d0c6001@smtp-brevo.com`) contains `@`, which must be percent-encoded (`%40`) when embedded in the URL form — called out explicitly in the apply task and in `.env.example`'s comment, not something either artifact needs to spell out the actual value for.

### 2. Local dev/test SMTP target: a new Mailpit service, not real Brevo

Add `mailpit` (image `axllent/mailpit`) to `infra/docker-compose.yml`: SMTP on `1025` (no auth required, matching `.env.example`'s existing `smtp://localhost:1025` placeholder exactly), HTTP API/UI on `8025`. `apps/api` tests send real email via nodemailer against this real local SMTP server, then fetch the received message back via Mailpit's REST API (`GET http://localhost:8025/api/v1/messages`) to assert on real subject/recipient/body content — consistent with this project's established "real Postgres/Redis/MinIO in tests, no mocking" discipline, extended to email. The real Brevo credential is never needed locally at all; it only ever gets typed into Railway's env var dashboard for the deployed environment.

### 3. Reset tokens: a new `PasswordResetToken` model, hash stored (not raw token)

```prisma
model PasswordResetToken {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  tokenHash String   @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())

  @@index([userId])
}
```

The raw token (`crypto.randomBytes(32).toString("hex")`) goes in the emailed URL; only its SHA-256 hash is stored, so a database read alone can't produce a usable reset link (same reasoning as password hashing itself, applied to a bearer token). Redemption hashes the incoming token and looks it up by `tokenHash`. Expiry: 1 hour (`expiresAt = now + 1h` at issuance) — a conventional default for this kind of link, not specified by the user; documented here rather than asked about since it's a minor, easily-changed constant. On a new forgot-password request for an account with prior outstanding unused tokens, those are marked `usedAt = now` too (invalidated) so only the newest link is redeemable, closing the "requested twice, old link still works" gap.

Migration: plain `prisma migrate dev` should work here (no known conflicting hand-edited migration in this area); fall back to the established shadow-DB-diff workaround (used repeatedly elsewhere in this project's history) only if it hits the same checksum-mismatch issue seen before.

### 4. Generic response is enforced by never branching on match/no-match in the HTTP response path

`POST /api/auth/forgot-password` always returns `200` with the same body/message. The "send email or don't" decision happens as a side effect inside the handler, after that response shape is already fixed — not via early-return branches that could accidentally leak timing or shape differences. The route awaits the DB lookup and (if matched) the email send before responding, rather than firing the email send in the background, so a transiently-slow SMTP relay doesn't need special handling — accepted latency trade-off, consistent with this change's Non-Goals around retry/queueing.

### 5. `POST /api/auth/reset-password` never distinguishes error causes

Expired, already-used, and unknown tokens all produce the same `DomainError` (`INVALID_RESET_TOKEN`, 400) with the same message. This mirrors the login route's own "don't distinguish wrong-password from unknown-identifier" precedent, applied to reset tokens: a token is effectively a bearer credential, and revealing *why* it failed (expired vs. already-used vs. never-existed) is minor information leakage worth avoiding for free.

### 6. Untrack `.env`

`git rm --cached .env` + add `.env` to `.gitignore`, as its own early task, before any SMTP configuration work touches that file. `.env.example` (which never contains real values) stays tracked as-is — only the real local `.env` is untracked. This is unrelated to password reset mechanically, but is a precondition the user explicitly asked to do now given the timing (a real third-party secret is about to enter the picture for the first time).

### 7. Rate limits

New tier `FORGOT_PASSWORD_RATE_LIMIT = { max: 5, timeWindow: "1 hour" }` on `POST /api/auth/forgot-password`, matching `REGISTRATION_RATE_LIMIT`'s tier exactly (same risk profile: public, unauthenticated, potentially email-spam-abusable). `POST /api/auth/reset-password` gets `RESET_PASSWORD_RATE_LIMIT = { max: 10, timeWindow: "15 minutes" }`, matching `LOGIN_RATE_LIMIT` (guards against token brute-forcing, though a 32-byte random token makes that infeasible regardless).

## Risks / Trade-offs

- **[Risk]** Percent-encoding the `@` in the Brevo username inside `SMTP_URL` is a manual step the user must get right in Railway's dashboard → **Mitigation**: called out explicitly in the apply task with the exact encoding needed, verified against a real send during apply (not just unit-tested).
- **[Risk]** No email-verification-on-registration exists, so a password reset email is sent to whatever address is on file even if it was never confirmed to be reachable by its owner → **Mitigation**: out of scope for this change (see Non-Goals); pre-existing behavior of the registration flow, not worsened by this change.
- **[Trade-off]** Synchronous SMTP send inside the request (Decision 4) means a slow/hanging SMTP relay slows down the forgot-password response. Accepted given this project's existing minimal-scope precedent and the low request volume expected for this endpoint (further bounded by its own rate limit).
