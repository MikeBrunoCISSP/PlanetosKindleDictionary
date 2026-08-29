## Why

The product is being renamed from "Planetos" to "eReader Dictionaries" — a broader name reflecting that the dictionaries it generates aren't Kindle-specific in spirit, even though the current generator only targets Kindle's format today.

## What Changes

- Every place a user actually sees the app's name — the homepage heading, the login/register page heading, the header's brand link, the browser tab title, and password-reset email content (from-name, subject, body) — changes from "Planetos" to "eReader Dictionaries".
- The "Kindle Series Dictionaries" tagline that currently appears beneath "Planetos" on the login page and in the browser tab title is dropped — it now reads redundant next to "eReader Dictionaries," which already conveys the same idea.
- **Explicitly out of scope**: internal identifiers nobody using the app ever sees — the `@planetos/*` pnpm package scope, the `urn:planetos:error:*` API error-type identifiers, the mailer's placeholder `planetos.local` domain, and the `planetos-theme` localStorage key. Renaming these would be a large, purely-internal change (touching every import across the monorepo, every API error response's `type` field) with no user-visible benefit, and risks breaking things for no gain. Confirmed with the user before writing this proposal.

## Capabilities

### New Capabilities

- `branding/app-name`: the behavioral contract for where and how the app's display name appears to users (page headings, browser tab title, email branding).

### Modified Capabilities

(none — no existing capability spec currently governs app branding/naming)

## Impact

- **Frontend**: `apps/web/src/routes/index.tsx` (homepage heading), `apps/web/src/routes/login.tsx` (login page heading, tagline removed), `apps/web/src/components/AppHeader.tsx` (header brand link), `apps/web/index.html` (browser tab `<title>`, tagline removed).
- **Backend**: `apps/api/src/lib/mailer.ts` (from-name, subject, body text), `apps/api/tests/lib/mailer.test.ts` (assertions on that text).
- **Specs**: new `openspec/specs/branding/app-name/spec.md`.
