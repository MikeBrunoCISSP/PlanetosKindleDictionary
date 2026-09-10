## Why

Denying a Pending registration permanently deletes the account (confirmed in `admin/registration-approval`), which frees the email address for immediate re-registration. Someone denied for cause — spam, abuse, a bad-faith reason for joining — can register again with the exact same email right away, forcing an administrator to deny the same person repeatedly with no way to stop it short of a direct database edit. There is currently no way to permanently prevent a specific email address from registering.

## What Changes

- Add a durable, admin-managed list of blocked email addresses. `POST /api/auth/register` rejects any email on this list with `403 Forbidden`, before the existing duplicate-email/username check.
- The Deny action gains an optional "also block this email" step: denying still just deletes the account by default (unchanged), but an administrator can additionally block the email in the same action, in the same confirmation dialog.
- A new "Blocked Emails" section on the Admin Dashboard lists every blocked email (with who blocked it, when, and an optional reason), supports removing a block (unblocking), and supports proactively blocking an email address that has never attempted to register.
- Blocking or unblocking an email has no effect on any account that already exists under that email — this only governs new registration attempts. An administrator who wants to also remove an existing account still uses the existing Disable (or, for a Pending registration, Deny) action.

## Capabilities

### New Capabilities

- `admin/email-blocklist`: the Blocked Emails admin view (list, manually block, unblock) and its API.

### Modified Capabilities

- `auth/login-registration`: the User Registration requirement gains a rejection for a blocked email address.
- `admin/registration-approval`: the Denying a Registration requirement gains an optional "also block this email" behavior, without changing Deny's existing default behavior.

## Impact

- `apps/api/prisma/schema.prisma` — new `BlockedEmail` model; additive migration.
- `apps/api/src/routes/auth.ts` — registration handler gains a blocklist check.
- `apps/api/src/routes/admin.ts` — the deny-registration handler gains an optional block step.
- `apps/api/src/routes/adminBlockedEmails.ts` (new) — list/create/delete endpoints for the blocklist, registered in `apps/api/src/index.ts` and `apps/api/tests/helpers.ts`.
- `apps/api/src/lib/errors.ts` — new `EMAIL_BLOCKED` domain error.
- `packages/shared/src/auth.ts` (or a new `packages/shared/src/blocklist.ts`) — new DTOs/schemas for the blocklist and the extended deny request.
- `apps/web/src/routes/admin.tsx` — Deny dialog gains a checkbox; new Blocked Emails table + add-block form.
- `apps/web/src/lib/api.ts` — new `apiGetBlockedEmails`, `apiAddBlockedEmail`, `apiRemoveBlockedEmail`; `apiDenyRegistration` gains an optional `block` argument.
- Not affected: the existing Disable/Enable/Promote/Demote user-management actions, and any already-existing account — blocking only ever governs future `/api/auth/register` attempts.
