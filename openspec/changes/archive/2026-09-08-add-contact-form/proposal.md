## Why

Visitors currently have no way to reach the site operator directly from within the app — no contact form, no support email surfaced in the UI. Adding a Contact form under a new Help menu section gives every visitor (including one stuck in a pending-approval or unverified state who can't otherwise reach anyone) a way to send a message, delivered to the operator's own inbox via the app's existing Brevo email infrastructure.

## What Changes

- A new "Help" top-level section is added to the app header's menu, with a single "Contact" action that navigates to a new `/contact` page. Visible to every visitor, authenticated or not (same tier as the existing "Dictionaries" section).
- The Contact page presents a form (Name, Email, Subject, Message — message capped at 3000 characters) protected by the same Cloudflare Turnstile widget the Register form already uses, and rate-limited (5 submissions/hour/IP).
- Submitting the form durably records the message and delivers it, via the app's existing Brevo-backed mailer and background worker, to a single configured recipient address (the operator's personal inbox) — with `[eReader Dictionaries] ` prepended to the subject and the visitor's own address set as the reply-to, so replying in an inbox client reaches the visitor directly.
- The existing Turnstile-verification check (currently inline only in the register handler) is extracted into a small shared helper so both routes call the same, single implementation.
- No Brevo dashboard changes are required — the app's existing verified-sender setup already allows sending to any recipient; this only adds a new destination address via configuration.

## Capabilities

### New Capabilities

- `support/contact-form`: the Contact form's behavioral contract — required fields, the 3000-character message limit, the `[eReader Dictionaries] ` subject prefix, the 5/hour rate limit, Turnstile verification when enabled, and delivery to a configured recipient rather than the submitter.

### Modified Capabilities

- `navigation/app-menu`: adds a "Help" top-level section and its "Contact" shelf action (new requirements), and updates the "Minimal Menu for Anonymous Visitors" requirement to include Help alongside Dictionaries as visible to anonymous visitors.

## Impact

- `apps/api/prisma/schema.prisma` — new `ContactMessage` model (additive migration).
- `apps/api/src/lib/contactMessages.ts` (new), `apps/api/src/lib/mailer.ts` (adds `replyTo` support + a new sender function), `apps/api/src/lib/turnstile.ts` (new shared verification helper), `apps/api/src/routes/auth.ts` (uses the extracted helper, no behavior change), `apps/api/src/routes/contact.ts` (new), `apps/api/src/plugins/rateLimit.ts`, `apps/api/src/config.ts`, `apps/api/src/worker.ts`.
- `packages/shared/src/contact.ts` (new).
- `apps/web/src/routes/contact.tsx` (new), `apps/web/src/components/AppHeader.tsx`.
- `BREVO.md` and `infra/railway/README.md` — a short new section on setting the recipient address.
