## Context

See proposal.md - Why. Relevant existing code confirmed by reading it directly:

- `apps/api/src/routes/admin.ts`'s deny handler (`POST /api/admin/users/:id/deny`) takes no request body today and unconditionally `prisma.user.delete()`s the target.
- `apps/api/src/routes/auth.ts`'s register handler normalizes the email (`normalizeWord`, lowercase+trim) and stores that normalized value directly in `User.email` - there's no separate raw/normalized pair for email the way there is for `username`/`usernameNormalized`. The blocklist should follow the same convention: store the normalized email as the unique key.
- `apps/web/src/routes/admin.tsx` is a single page with two sections (Pending Registrations, Users) built from two self-contained components; there's no existing checkbox UI component in `apps/web/src/components/ui/`.
- `packages/shared/src/entries.ts`'s `rejectEntrySchema` (`{ note?: string, max 2000 }`) is the closest existing precedent for an optional free-text admin note - reused as the shape for the blocklist's `reason` field.

## Goals / Non-Goals

**Goals:**
- Block a specific email from registering, with a visible, manageable list.
- Let denying a registration optionally block in the same step, without changing Deny's existing default behavior.

**Non-Goals:**
- No effect on any already-existing account. Blocking/unblocking never touches `User` rows; it only gates `POST /api/auth/register`. Removing an existing account stays exactly what it is today (Disable for an approved account, Deny for a Pending one).
- No bulk import, wildcard/domain blocking (e.g. blocking `*@example.com`), or expiring/temporary blocks - one exact, permanent email per entry until explicitly unblocked.
- No audit history beyond the single current row - unblocking deletes the row outright, matching how Deny itself has no undo/history trail today.

## Decisions

### 1. New standalone `BlockedEmail` model, not a flag on `User`

A blocked email frequently has no corresponding `User` row at all (the row was just deleted by Deny, or the block is proactive and no one ever registered). A flag on `User` can't represent that. Standalone model, keyed on the normalized email string itself:

```prisma
model BlockedEmail {
  id          String   @id @default(cuid())
  email       String   @unique
  reason      String?
  blockedAt   DateTime @default(now())
  blockedById String?
  blockedBy   User?    @relation(fields: [blockedById], references: [id], onDelete: SetNull)

  @@index([blockedAt])
}
```

`blockedById` is `SetNull` on the admin's own account being deleted, matching the existing `reviewedById`/`submittedById` pattern elsewhere in the schema - the block itself must survive the blocking admin's account being removed.

### 2. Registration check: a separate query, checked before the existing duplicate-email/username check

```ts
const blocked = await prisma.blockedEmail.findUnique({ where: { email } });
if (blocked) throw Errors.EMAIL_BLOCKED();
```
placed right after Turnstile verification and before the existing `findFirst` duplicate check, using the same already-normalized `email` variable. Checked first (rather than folded into the same query) because it's a conceptually distinct rejection reason with its own error/status code (403, not 409) - keeping it a separate, obviously-named query is clearer than overloading one combined lookup.

New error in `apps/api/src/lib/errors.ts`:
```ts
EMAIL_BLOCKED: () =>
  new DomainError("EMAIL_BLOCKED", "This email address is not permitted to register.", 403),
```

### 3. Deny's extended request body

`POST /api/admin/users/:id/deny` currently takes no body. Extend it to accept an optional `{ block?: boolean }`, defaulting to `false` when the body is empty or absent (today's client sends no body at all, so this must degrade cleanly rather than fail validation on a missing body). When `block` is true, wrap the delete and the block creation in the same `prisma.$transaction` already implicit in "delete the account" - both succeed or neither does. Use `create` (not `upsert`) for the block row inside that transaction; if a `P2002` unique-constraint race occurs (the email was already blocked a moment earlier by a concurrent request), swallow it - the end state (account deleted, email blocked) is already correct either way, so surfacing an error here would be misleading.

Auto-populate `reason` for this path only, e.g. `` `Blocked when denying registration (was: ${username})` `` - captured before the delete, since the username won't exist to look up afterward. The manual block-creation endpoint (Decision 4) leaves `reason` to the admin's own input instead.

### 4. Blocklist CRUD lives in its own route file

`apps/api/src/routes/adminBlockedEmails.ts`, following this codebase's one-file-per-resource convention (`entries.ts`, `series.ts`, `turnstile.ts` are already separate from `admin.ts`), registered in `index.ts` and `tests/helpers.ts` alongside the others:

- `GET /api/admin/blocked-emails?page=&limit=` - same offset-pagination shape as `GET /api/admin/users` (this list isn't concurrently depleted by normal workflow the way the Pending queue is, so the simpler page/limit approach is a reasonable fit, not the cursor approach `GET /api/admin/users/pending` uses).
- `POST /api/admin/blocked-emails` - body `{ email, reason? }`; normalizes email the same way registration does; `reason` validated with `plainText({ max: 500 }).optional()` per the input-hardening spec's existing markup/length rules; returns `409` on an existing block (`P2002` → `Errors.DUPLICATE_EMAIL`-shaped conflict, but a distinct message since it's a different domain error - `EMAIL_ALREADY_BLOCKED`).
- `DELETE /api/admin/blocked-emails/:id` - `404` via `Errors.NOT_FOUND()` if the id doesn't exist.

Response DTOs expose `blockedById` as a plain id (nullable), not resolved to a username - matching `entryDtoSchema`'s existing `submittedById`/`reviewedById` precedent of returning ids without joining, rather than introducing a new pattern.

### 5. Frontend: a plain checkbox, not a new UI-kit component

No `Checkbox` component exists in `apps/web/src/components/ui/` yet. Rather than introduce one for a single use site, the Deny dialog gets a plain native `<input type="checkbox">` with a `<label>`, styled minimally with Tailwind - consistent with how this app already reaches for a native element directly when a dedicated component isn't already present, rather than always going through the shadcn kit.

The Blocked Emails section is a third block on the existing `/admin` page (`apps/web/src/routes/admin.tsx`), matching how Pending Registrations and Users already coexist there as sibling sections rather than separate routes - one admin-dashboard page stays the app's single navigation entry point for admin functionality (already stated as a constraint in `admin/user-management`'s own spec).

## Risks / Trade-offs

- **A block is permanent and exact-match only (case-insensitive, but not fuzzy).** Someone determined to evade it can register a new email address entirely - this only stops the same address, not the same person. That's the same limitation as any email-based block; a follow-up (IP-based blocking, disposable-email detection) would be a separate change if this turns out to be insufficient in practice.
- **Blocking is irreversible from the visitor's side but not from the admin's.** An admin who blocks the wrong address by mistake can immediately unblock it from the new Blocked Emails section - this is exactly why proposal.md treats visibility/unblock as required rather than optional.
