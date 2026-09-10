## 1. Data model

- [x] 1.1 Add the `BlockedEmail` model to `apps/api/prisma/schema.prisma` per design.md Decision 1 (`email` unique, `reason` nullable, `blockedAt` default now, `blockedById` nullable `SetNull` relation to `User`, `@@index([blockedAt])`). Generate and apply the migration (`prisma migrate dev`); verify it is purely additive (one new table, no changes to existing tables) and `pnpm --filter @planetos/api exec tsc --noEmit` passes.

## 2. Shared schemas and errors

- [x] 2.1 Add `EMAIL_BLOCKED` (403) and `EMAIL_ALREADY_BLOCKED` (409) to `apps/api/src/lib/errors.ts`, matching the existing `DomainError` pattern.
- [x] 2.2 Create `packages/shared/src/blocklist.ts` exporting: `blockedEmailDtoSchema` (`id`, `email`, `reason: string | null`, `blockedAt: string datetime`, `blockedById: string | null`), `createBlockedEmailSchema` (`email: z.string().email()`, `reason: plainText({ max: 500 }).optional()`), and `denyRegistrationSchema` (`block: z.boolean().default(false)`). Export it from `packages/shared/src/index.ts`. Rebuild the shared package (`pnpm --filter @planetos/shared run build`) and verify `pnpm --filter @planetos/shared exec tsc --noEmit` passes. (Correction to design.md: skipped `blockedEmailsPageDtoSchema`/`pagedSchema` - that helper is cursor-shaped (`nextCursor`), which doesn't fit; per design.md Decision 4 the list endpoint mirrors `GET /api/admin/users`'s plain-array response instead, so no paged wrapper type is needed.)

## 3. Registration enforcement

- [x] 3.1 In `apps/api/src/routes/auth.ts`'s register handler, add the blocklist check (query `prisma.blockedEmail` by the already-normalized `email`, throw `Errors.EMAIL_BLOCKED()` if found) immediately after the Turnstile check and before the existing duplicate-email/username check, per design.md Decision 2. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes.
- [x] 3.2 Add test cases to `apps/api/tests/auth.test.ts`: registering with a blocked email returns `403` and creates no record; registering with a blocked email in different letter casing is still rejected; an unblocked, non-blocked email registers normally (no regression). Verify all pass.

## 4. Deny-and-block

- [x] 4.1 In `apps/api/src/routes/admin.ts`'s deny handler, accept an optional `{ block?: boolean }` body (tolerant of no body at all) per design.md Decision 3. When `block` is true, wrap the account deletion and the `BlockedEmail` creation (with an auto-populated `reason` capturing the pre-delete username) in one `$transaction`; swallow a `P2002` on the block creation (already blocked by a race) without failing the request. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes.
- [x] 4.2 Add test cases to `apps/api/tests/adminRegistrations.test.ts`: denying without `block` (or with no body at all) deletes the account and does not create a `BlockedEmail` row (confirms the existing default behavior is unchanged); denying with `block: true` deletes the account and creates a `BlockedEmail` row whose `reason` mentions the denied username; a subsequent registration attempt with that email is then rejected per task 3.1's behavior. Verify all pass, including the full existing file unchanged otherwise.

## 5. Blocklist CRUD API

- [x] 5.1 Create `apps/api/src/routes/adminBlockedEmails.ts` per design.md Decision 4: `GET /api/admin/blocked-emails` (paginated, newest-first), `POST /api/admin/blocked-emails` (normalizes email, `409` via `EMAIL_ALREADY_BLOCKED` on an existing block), `DELETE /api/admin/blocked-emails/:id` (`404` via `Errors.NOT_FOUND()` if missing) - all gated by the existing `requireAdmin` preHandler. Register the route in `apps/api/src/index.ts` and in `apps/api/tests/helpers.ts`'s `buildApp()`. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes.
- [x] 5.2 Add `apps/api/tests/adminBlockedEmails.test.ts` covering, per the new `admin/email-blocklist` spec: list is newest-first and paginated; non-admin/unauthenticated rejections (403/401) on all three endpoints; manual block succeeds and appears in the list; manual block is case-insensitive against a later registration attempt; blocking an already-blocked email returns 409; unblocking removes the entry and a subsequent registration with that email succeeds; unblocking a nonexistent id returns 404. Verify all pass.

## 6. Frontend

- [x] 6.1 In `apps/web/src/lib/api.ts`, add `apiGetBlockedEmails(page)`, `apiAddBlockedEmail({ email, reason })`, `apiRemoveBlockedEmail(id)`, and extend `apiDenyRegistration` to accept an optional `block` argument sent as the request body.
- [x] 6.2 In `apps/web/src/routes/admin.tsx`'s Deny confirmation dialog, add a plain checkbox (per design.md Decision 5) labeled "Also block this email from registering again", unchecked by default, and pass its state through to `apiDenyRegistration`.
- [x] 6.3 In `apps/web/src/routes/admin.tsx`, add a "Blocked Emails" section (third sibling section, after Users) with a table (Email, Reason, Blocked At, Unblock action) and a small add-block form/dialog (Email + optional Reason). Verify `pnpm --filter @planetos/web exec tsc --noEmit` passes.

## 7. Browser verification

- [x] 7.1 Start the web + API dev servers. As an admin, deny a Pending registration without checking "also block"; confirm the account is deleted and re-registering with that email succeeds normally.
- [x] 7.2 Deny a different Pending registration with "also block" checked; confirm the account is deleted, the email appears in the new Blocked Emails section, and re-registering with that email is rejected with a clear error.
- [x] 7.3 In the Blocked Emails section, manually add a block for an email that never registered, confirm it appears in the list, then unblock it and confirm a registration attempt with that email now succeeds.

## 8. Final verification

- [x] 8.1 `pnpm run typecheck` and `pnpm --filter @planetos/api test` both pass in full - no regressions to any existing suite, in particular `apps/api/tests/adminRegistrations.test.ts`'s and `apps/api/tests/auth.test.ts`'s existing (unmodified-intent) cases. Confirmed: full monorepo typecheck clean; API suite 410/410 tests passed across 39 files.
- [x] 8.2 `openspec validate add-email-blocklist --type change --strict` passes. Confirmed: "Change 'add-email-blocklist' is valid".
- [x] 8.3 Read-through: confirm no existing account, Disable/Enable/Promote/Demote action, or already-registered email is affected by this change - blocking/unblocking only ever gates new `POST /api/auth/register` attempts. Confirmed by reading `apps/api/src/routes/admin.ts`: Approve, the Enable/Disable/Promote/Demote `PATCH /api/admin/users/:id` handler, and the pending/user listings are byte-for-byte unchanged; the only modified handler is Deny (block defaults to `false`, preserving prior behavior when omitted), and the new blocklist CRUD routes and the `auth.ts` register-time check are additive.
