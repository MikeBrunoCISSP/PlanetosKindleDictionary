## Context

`SPEC.md` §6 already documents `POST /api/auth/verify-email { token }`, and `User.emailVerified` already exists in the schema (default `false`) — but nothing has ever set it, nothing checks it, and the endpoint doesn't exist. This is the same "documented but never built" situation as the earlier password-reset change, which this design leans on heavily: `PasswordResetToken`, its hashed-token/single-use/generic-error patterns, and `apps/api/src/lib/mailer.ts` are the direct precedent for everything here.

Confirmed with the user before writing this proposal: registration stops auto-opening a session (it currently does, via `request.session.userId = user.id` right in the register handler); existing accounts are grandfathered in as already-verified via a migration backfill, so nobody currently able to log in (including the seeded admin) loses access; and a "resend verification email" capability ships in this same change rather than being deferred, since without it a lost or expired first email is a permanent, unrecoverable lockout.

`requireApproved` (`apps/api/src/plugins/requireAuth.ts`), which gates entry creation on `approvalStatus === "APPROVED"`, is what "approved to create/edit dictionary entries" refers to — confirmed by tracing it from `POST /api/series/:slug/entries`'s `preHandler`. The notification email fires from `POST /api/admin/users/:id/approve` (`apps/api/src/routes/admin.ts`), the only place `approvalStatus` transitions `PENDING` → `APPROVED`.

## Goals / Non-Goals

**Goals:**
- No account can log in with an unverified email, except accounts that existed before this change shipped.
- Losing the verification email is recoverable via a self-service resend, without revealing account existence or verification state to an unauthenticated caller.
- Approving a user's registration reliably notifies them, without registration-approval itself ever failing because of an email delivery problem.

**Non-Goals:**
- No email sent on registration *denial* — only approval, matching the literal request.
- No additional gate on `requireApproved`-protected routes beyond what already exists. Once login itself requires a verified email, every session it produces is already guaranteed verified — entry creation/editing needs no separate check.
- No UI surfacing of `emailVerified` status in the admin user table — not requested, and the admin's pending-registration queue already exists independently of this.

## Decisions

### 1. `EmailVerificationToken` mirrors `PasswordResetToken` exactly, including the cascade-delete lesson learned from it

```prisma
model EmailVerificationToken {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}
```

Same reasoning as `PasswordResetToken`: only a SHA-256 hash of the raw token is stored, the raw token lives only in the emailed URL. `onDelete: Cascade` is included from the start this time — the password-reset change originally omitted it and hit a real foreign-key-violation test failure requiring a follow-up migration; no reason to repeat that here. Expiry: 24 hours (longer than password reset's 1 hour — verifying an email is lower-stakes and less time-sensitive than a password reset link, so a more generous window reduces avoidable resend traffic).

### 2. Migration backfill: grandfather every existing account in the same migration that adds the column semantics

The migration that adds `EmailVerificationToken` also runs:

```sql
UPDATE "User" SET "emailVerified" = true WHERE "emailVerified" = false;
```

Every row present in the table at migration time predates this feature by definition (the code path that could ever produce a real unverified registration doesn't exist until this change's application code also ships) — no `createdAt` cutoff or other scoping is needed. `apps/api/prisma/seed.ts`'s admin upsert also gets `emailVerified: true` added to both its `create` and `update` blocks, so a fresh local database seeded from scratch always has a login-able admin without needing to hand-run the migration backfill logic again.

### 3. Login checks `emailVerified` alongside `isActive`, before password verification — same ordering as the existing disabled-account check

```ts
if (!user) throw Errors.INVALID_CREDENTIALS();
if (!user.isActive) throw Errors.ACCOUNT_DISABLED();
if (!user.emailVerified) throw Errors.EMAIL_NOT_VERIFIED();
const valid = await verify(user.passwordHash, body.password);
if (!valid) throw Errors.INVALID_CREDENTIALS();
```

This matches the existing `isActive` check's placement exactly (before password verification, so a wrong password against a disabled account still surfaces "disabled" rather than "invalid credentials" — a minor pre-existing information disclosure this change doesn't introduce or worsen, just follows). Revealing "email not verified" as a distinct 403 is not a meaningful enumeration risk the way forgot-password's account-existence question is: the caller already knows the account exists and supplied a real password for it.

### 4. Resend-verification follows forgot-password's generic-response shape exactly, including the "silently do nothing" branches

`POST /api/auth/resend-verification { identifier }` always returns the same `200` message. It only sends an email when the identifier matches an account that is both `isActive` and **not yet verified** — an already-verified account or a disabled account produces the identical response with no email sent, for the same non-enumeration reasoning `forgot-password` already established. A new token issuance invalidates prior unused verification tokens for that account (same "only the newest link works" rule as password reset).

### 5. Registration no longer opens a session; the frontend gets a "check your email" result state instead of an auto-redirect

`POST /api/auth/register` still creates the user and returns `201` with the profile, but drops the `request.session.userId = ...` / `request.session.save()` calls entirely. `RegisterForm` in `apps/web/src/routes/login.tsx` changes from "set query data + toast + navigate home" to rendering an inline success state (mirroring `ForgotPasswordForm`'s existing "Check your email" card pattern) that also offers a "resend" action — reusing the just-submitted email as the resend identifier, no extra typing required. The Sign In form's `EMAIL_NOT_VERIFIED` error state gets the same resend affordance, using whatever identifier the user just typed into the Sign In form. No new frontend "mode" or route is introduced for resend — it's an action embedded in the two screens where it's actually needed, not a standalone page.

### 6. Approval email is sent after the DB update commits, wrapped in try/catch that only logs on failure

```ts
await prisma.user.update({ where: { id }, data: { approvalStatus: "APPROVED" } });
try {
  await sendAccountApprovedEmail(user.email);
} catch (err) {
  request.log.error(err, "Failed to send account-approved email");
}
```

Unlike `forgot-password`'s handler (where an unhandled send failure would surface as a 500, currently latent/unaddressed pre-existing behavior, out of scope here), the admin approving a user is a real, already-confirmed UI action with its own success feedback — there's no non-enumeration reason to let a flaky SMTP relay turn a successful approval into a failed request. The email is explicitly best-effort.

## Risks / Trade-offs

- **[Risk]** The migration backfill (`UPDATE "User" SET "emailVerified" = true WHERE "emailVerified" = false`) runs unconditionally against every environment this migration is applied to, including a fresh empty database — harmless there (zero rows match), but worth calling out so it isn't mistaken for a no-op that was forgotten. → **Mitigation**: covered explicitly by an integration test seeding a "pre-existing" account before the logic under test runs, not just inferred from the migration SQL.
- **[Risk]** Existing `apps/api/tests/auth.test.ts` registration tests currently assert a `set-cookie` header is present on successful registration — this change makes that false. → **Mitigation**: called out as its own task; those specific assertions are updated, not the whole file's intent.
- **[Trade-off]** No standalone "resend verification" page/mode — only reachable from the two points in the UI where it's actually needed (post-registration, post-failed-login). Accepted per design decision 5; revisit if a future need for a fully standalone entry point emerges.
