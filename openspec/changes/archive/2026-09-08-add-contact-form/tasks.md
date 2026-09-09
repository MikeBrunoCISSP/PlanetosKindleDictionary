## 1. Data model

- [x] 1.1 Add the `ContactMessage` model to `apps/api/prisma/schema.prisma` per design.md Decision 1 (reusing the existing `EmailOutboxStatus` enum, `@@index([status, createdAt])`). Generate and apply the migration (`prisma migrate dev`); verify it is purely additive (one new table, no changes to existing tables/enums) and `pnpm --filter @planetos/api exec tsc --noEmit` passes.

## 2. Mailer: replyTo support and the contact sender

- [x] 2.1 In `apps/api/src/lib/mailer.ts`, add optional `replyTo?: string` to the `Message` interface, thread it through `sendViaSmtp` (bare string) and `sendViaBrevoApi` (wrapped as `{ email: msg.replyTo }`, per design.md Decision 3), then add `sendContactMessageEmail({name,email,subject,message})` sending to `config.contactRecipientEmail` with the `[eReader Dictionaries] ` subject prefix and `replyTo: payload.email`. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes.
- [x] 2.2 Add a test case to `apps/api/tests/lib/mailerBrevo.test.ts` asserting the exact JSON body shape (`replyTo: { email }`) sent to Brevo when `sendViaBrevoApi` is called with `replyTo` set, and confirm the three existing test cases (which never set `replyTo`) still pass unchanged.

## 3. Config

- [x] 3.1 Add `CONTACT_RECIPIENT_EMAIL` to `apps/api/src/config.ts` per design.md Decision 7: required in strict mode for both `api` and `worker` scopes (add to `WORKER_REQUIRED`), validated as non-empty and email-shaped via the same format regex `MAIL_FROM_ADDRESS` uses, without its domain-blocklist checks. Add `contactRecipientEmail: string` to the `Config` interface and `parseEnv`. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes.
- [x] 3.2 Add tests to `apps/api/tests/config.test.ts` mirroring the existing `MAIL_FROM_ADDRESS`-style tests: `CONTACT_RECIPIENT_EMAIL` required in strict mode for both `api` and `worker` scope, rejected when malformed, and (unlike `MAIL_FROM_ADDRESS`) accepted when pointed at an ordinary personal-looking domain that `MAIL_FROM_ADDRESS`'s blocklist would reject (proving the blocklist was deliberately not reused). Verify the new tests pass.
- [x] 3.3 Add `CONTACT_RECIPIENT_EMAIL=` to `.env.example` with a short comment, matching the style of the existing mail variables' comments.

## 4. Turnstile helper extraction

- [x] 4.1 In `apps/api/src/lib/turnstile.ts`, add `requireTurnstileIfEnabled(prisma, token, ip)` per design.md Decision 6, moving the exact settings-lookup/enabled-check/decrypt/verify/throw logic currently inline in `apps/api/src/routes/auth.ts`'s register handler. Update the register handler to call this helper instead of its inline block. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes and the full existing `apps/api/tests/auth.test.ts` suite (including its Turnstile-related cases) still passes unchanged — this is a pure refactor, not a behavior change.

## 5. Contact message processing + queue wiring

- [x] 5.1 Create `apps/api/src/lib/contactMessages.ts` exporting `createContactMessage(tx, data)` and `processContactMessage(prisma, id)` per design.md Decision 2 (idempotent on `status === "SENT"`, same attempts/error bookkeeping as `processEmailOutbox`). Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes.
- [x] 5.2 In `apps/api/src/worker.ts`, add a `job.name === "send-contact-message"` branch to `processEmailQueueJob` calling `processContactMessage(prisma, contactMessageId)`, and broaden `reconcilePendingEmails()` to also query stale-PENDING `ContactMessage` rows (same 5-minute threshold) and enqueue them the same way, per design.md Decision 4. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes.
- [x] 5.3 Add tests in a new `apps/api/tests/lib/contactMessages.test.ts` against real Postgres/Redis/Mailpit: `processContactMessage` sends the email and marks the row SENT; a row already SENT is a no-op on retry; a send failure marks the row FAILED with `attempts` incremented and `error` populated, then rethrows. Verify all pass.

## 6. API route

- [x] 6.1 Add `CONTACT_RATE_LIMIT = { rateLimit: { max: 5, timeWindow: "1 hour" } }` to `apps/api/src/plugins/rateLimit.ts`, matching `FORGOT_PASSWORD_RATE_LIMIT`'s exact shape.
- [x] 6.2 Create `packages/shared/src/contact.ts` exporting `contactMessageSchema` per design.md Decision 8, and export it from `packages/shared/src/index.ts`. Rebuild the shared package (`pnpm --filter @planetos/shared run build`) so `apps/api`/`apps/web` resolve the new export. Verify `pnpm --filter @planetos/shared exec tsc --noEmit` passes.
- [x] 6.3 Create `apps/api/src/routes/contact.ts` with `POST /api/contact` per design.md Decision 5: `CONTACT_RATE_LIMIT`, parse via `contactMessageSchema`, call `requireTurnstileIfEnabled`, create the `ContactMessage` row, best-effort enqueue `"send-contact-message"` on the email queue (log-only on enqueue failure), respond `201` with `{ id }`. Register the route in `apps/api/src/index.ts` (and `apps/api/tests/helpers.ts`'s `buildApp()` for tests) alongside the other route registrations. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes.
- [x] 6.4 Add `apps/api/tests/contact.test.ts` against real Postgres/Redis/Mailpit covering, per the new `support/contact-form` spec: successful submission (201, row created, email eventually delivered via Mailpit with the `[eReader Dictionaries] ` subject prefix and correct reply-to), over-length message rejected (400), markup in name/subject rejected (400), invalid email format rejected (400), rate limit exceeded after 5 requests/hour/IP (429 with `Retry-After`), and the three Turnstile scenarios (valid token accepted, missing/invalid token rejected, disabled bypasses verification) using the same test patterns `apps/api/tests/auth.test.ts` already uses for register's Turnstile behavior. Verify all pass.

## 7. Frontend: Contact page

- [x] 7.1 Add `apiSubmitContactMessage` to `apps/web/src/lib/api.ts`, calling `POST /api/contact`.
- [x] 7.2 Create `apps/web/src/routes/contact.tsx` per design.md Decision 9: a form (Name, Email, Subject, Message) using `contactMessageSchema` + zodResolver, the same Turnstile widget/`apiGetTurnstileConfig`/pre-submit-guard pattern as the Register form in `login.tsx`, and a post-submit success state. Verify `pnpm --filter @planetos/web exec tsc --noEmit` passes.

## 8. Frontend: Help menu section

- [x] 8.1 In `apps/web/src/components/AppHeader.tsx`, add `"help"` to the `openSection` union type, a "Help" toggle `DropdownMenuItem` (visible to every visitor, matching "Dictionaries"), and a "Contact" shelf item navigating to `/contact`, per design.md Decision 10. Verify `pnpm --filter @planetos/web exec tsc --noEmit` passes.

## 9. Browser verification

- [x] 9.1 Start the web + API dev servers (Turnstile disabled, matching how Register is exercised locally). As an anonymous visitor, open the hamburger menu, confirm "Help" is visible alongside "Dictionaries" (not "Entries"/"Administration"), expand it, click "Contact", and confirm navigation to the Contact page.
- [x] 9.2 Submit the Contact form with valid data; confirm a success state is shown, a `ContactMessage` row is created, and — after the worker processes the queue — a real email arrives in Mailpit with the `[eReader Dictionaries] ` subject prefix, the submitted message body, and a reply-to header matching the submitted email address.
- [x] 9.3 Confirm the same menu/Contact flow also works for a logged-in user (Help section still present, Contact still reachable).

## 10. Documentation

- [x] 10.1 Add a short new section to `BREVO.md` explaining that forwarding contact messages to a personal inbox needs no Brevo dashboard changes — only setting `CONTACT_RECIPIENT_EMAIL` (on both `app` and `worker`, since the worker is what actually sends).
- [x] 10.2 Add the equivalent `CONTACT_RECIPIENT_EMAIL` variable-setting step to `infra/railway/README.md`'s §5.1 (or a new short subsection), and its row to the variable reference table at the bottom of that file.

## 11. Final verification

- [x] 11.1 `pnpm --filter @planetos/api exec tsc --noEmit` and `pnpm --filter @planetos/web exec tsc --noEmit` both pass.
- [x] 11.2 `pnpm --filter @planetos/api test` passes in full against real Postgres/Redis/MinIO/Mailpit — no regressions to any existing suite (in particular, `auth.test.ts`'s register/Turnstile tests, after the helper extraction).
- [x] 11.3 `openspec validate add-contact-form --type change --strict` passes.
- [x] 11.4 Read-through: confirm the register handler's externally observable behavior is unchanged after the Turnstile helper extraction; confirm `CONTACT_RECIPIENT_EMAIL` is required on both `app` and `worker` scopes exactly like the other mail vars; confirm the migration is purely additive; confirm no existing mailer test broke from the new optional `replyTo` field.
