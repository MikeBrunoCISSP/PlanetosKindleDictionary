## Why

The app is starting to accept free-text input from users (Series title/description today; dictionary-entry fields like `Entry.definitionHtml` are already modeled in the schema for a near-future capability). Today that input is validated only for shape (non-empty strings), with no length cap, no rejection of markup, no HTTP security headers, and no CORS allowlist — so nothing stops stored XSS payloads from being persisted, and the API is unnecessarily exposed to cross-origin requests. A review of "Securing web applications against XSS and SQLi attacks using a novel deep learning approach" (Tadhani et al., Sci Rep 2024) confirmed SQL injection is already effectively mitigated (Prisma parameterizes all queries; no raw SQL exists in the codebase), but XSS input/output handling and standard HTTP hardening have real gaps worth closing before more free-text surfaces ship.

## What Changes

- Add a reusable "plain text" validation rule (shared Zod helper) that rejects free-text API input containing HTML-like markup and enforces a maximum length, applied to Series `title`/`description`.
- Add `@fastify/cors`, restricting cross-origin requests to the configured `PUBLIC_BASE_URL` origin with credentials support.
- Add `@fastify/helmet` to send standard hardening response headers from the API.
- Add a Content-Security-Policy `<meta>` tag to the web app's `index.html`.
- Add lint enforcement (`react/no-danger`) so any future unsanitized `dangerouslySetInnerHTML` usage is caught before merge.
- Document and lint-enforce a "no raw/unparameterized SQL" convention so the SQLi protection Prisma already provides isn't silently eroded later.

## Capabilities

### New Capabilities
- `security/input-hardening`: Server-side validation/rejection rules for free-text input, HTTP security headers, CORS restriction, and output-encoding conventions (no `dangerouslySetInnerHTML` without sanitization) that apply across the app's free-text surfaces.

### Modified Capabilities
(none — no existing spec's requirements change; `security/input-hardening` is net-new)

## Impact

- `packages/shared/src/series.ts` — `title`/`description` schemas gain max-length and markup-rejection rules via a new shared validation helper.
- `apps/api/src/index.ts`, new `apps/api/src/plugins/cors.ts`, new `apps/api/src/plugins/security.ts` — CORS and helmet registered alongside existing session/rate-limit/error-handler plugins.
- `apps/web/index.html` — CSP `<meta>` tag added.
- ESLint configs (API and web) — new restricted-syntax/no-danger rules.
- `apps/api/package.json` — new dependencies `@fastify/cors`, `@fastify/helmet`.
- No database schema changes. No changes to existing endpoint contracts beyond stricter validation on `title`/`description` (previously-accepted markup or over-length input will now be rejected with 400).

**Out of scope**: sanitizing/rendering `Entry.definitionHtml` — that field has no routes yet; whichever future change implements dictionary-entry CRUD must apply `sanitize-html`/`DOMPurify` there specifically, since (unlike Series title/description) it's meant to hold markup.
