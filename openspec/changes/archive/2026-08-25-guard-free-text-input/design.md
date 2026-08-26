## Context

See proposal.md - Why. Two things shape this design: (1) Prisma is already the only database access path in `apps/api/src` (no raw SQL exists), so the SQLi requirement is about *codifying and enforcing* current behavior, not changing it; (2) the web app (`apps/web`) is a static SPA with no server-rendered HTML, deployed on a different origin than the Fastify API — so CSP has to be declared in the SPA's own document, while the API's hardening is limited to response headers (not CSP, since the API serves JSON, not documents).

## Goals / Non-Goals

**Goals:**
- Close the input-validation gap (unbounded, unfiltered free text) with a rule that's reusable across future free-text fields, not just Series.
- Add standard HTTP hardening (headers, CORS) without introducing a framework the team doesn't already use.
- Make the "always use parameterized queries" and "never render unsanitized HTML" rules enforceable (lint), not just documented.

**Non-Goals:**
- Building any form of attack-detection model or ML-based WAF (see proposal.md - Why for why the source paper's core contribution doesn't apply here).
- Sanitizing/rendering `Entry.definitionHtml` — no routes exist for it yet; that's a requirement for whichever future change implements dictionary-entry CRUD, not this one.
- Changing Prisma usage patterns — they already satisfy the SQLi requirement.

## Decisions

**Reject markup, don't strip it.** Series `title`/`description` are plain-text fields by design — no current UI ever intends them to hold markup. Silently stripping tags would mutate what the user typed without telling them; rejecting with a clear 400 validation error surfaces the problem immediately in the existing react-hook-form + zod flow, with no new dependency (implemented as a `.refine()` on the existing Zod schemas, not a sanitizer library). A sanitizer library (`sanitize-html`/`DOMPurify`) is deferred to whichever field is actually meant to hold markup (`Entry.definitionHtml`), where stripping-to-safe-subset is the correct behavior instead of rejection.

**Shared Zod helper over per-field rules.** A `plainText({ min, max })` helper in `packages/shared/src/validation.ts` centralizes the markup-rejection regex and length cap so the next free-text field (e.g. `Entry.headword`, `Revision.comment`) reuses it instead of re-implementing ad hoc validation.

**CSP lives in two places.** Because the SPA and API are cross-origin and the API never returns HTML, a single CSP can't cover both. The SPA's `index.html` gets a `<meta http-equiv="Content-Security-Policy">` tag (covers script/style/connect sources for the document the browser actually renders); the API gets `@fastify/helmet` for the headers that do apply to a JSON API (`X-Content-Type-Options`, `Referrer-Policy`, etc.), with helmet's CSP directive left off or minimal since it has no document to protect.

**`@fastify/cors` restricted to `PUBLIC_BASE_URL`.** That env var already exists and is documented as "used for CORS and email links" (`.env.example`) — reusing it avoids introducing a new config surface. `credentials: true` is required because the web client sends cookies (`credentials: "include"` in `apps/web/src/lib/api.ts`) for session auth.

**Lint over runtime checks for the two "never do this" rules.** Both "no raw SQL" and "no unsanitized `dangerouslySetInnerHTML`" are things that should never compile into the codebase at all, not conditions to handle at runtime — an ESLint `no-restricted-syntax`/`react/no-danger` rule catches them at PR time, before they ever run.

**Minimal ESLint config, not a full recommended baseline.** Discovered during implementation: this repo has never had ESLint configured at all (no config file, no dependency, despite `apps/web`'s `package.json` already having a stub `lint` script). Turning on `eslint:recommended` + `typescript-eslint recommended` across a codebase that's never been linted risks surfacing an unbounded amount of unrelated pre-existing issues, which is out of scope for a security-focused change. Instead, each package gets a flat `eslint.config.js` containing *only* the rule this change needs (`react/no-danger` for web, `no-restricted-syntax` for the API's `$queryRawUnsafe`/`$executeRawUnsafe`), plus the minimum `languageOptions.parser` wiring needed for ESLint to parse TS/TSX at all. Adopting a fuller lint baseline is a reasonable follow-up but a separate decision.

## Risks / Trade-offs

- [Legitimate titles/descriptions containing a literal `<` or `>` (e.g. "Sales < 10%") get rejected] → Acceptable for now since no current content requires it; the validation error message should tell the user exactly what was rejected so they can rephrase. If this proves too strict in practice, a follow-up can special-case escaped-safe characters rather than loosening markup detection broadly.
- [CSP `connect-src` must correctly list the deployed API origin per environment] → The meta tag's `connect-src` needs the real API origin at build/deploy time; document this as a required deploy-config step rather than hardcoding a single origin.
- [Helmet's default CSP directive could unexpectedly affect API error pages or docs if ever added later] → Explicitly configure/disable the CSP directive in the helmet plugin now, with a comment explaining why, so it isn't silently reintroduced.
- [`frame-ancestors` has no effect when delivered via a `<meta>` tag - confirmed via a browser console warning during implementation] → Omitted from the SPA's CSP meta tag rather than left in as dead weight; clickjacking protection for the document would need to come from an HTTP header, which isn't available for a statically-hosted SPA in this repo - noted as a gap for whatever serves the production build (static host/CDN config), not something this change can close.
- [The web app's fetch calls are always relative paths (`/api/...`), relying on a same-origin-presenting proxy (Vite's dev proxy locally; unspecified in production) rather than an absolute API origin] → `connect-src 'self'` is sufficient given this pattern; no API-origin needs to be templated into the CSP. Confirmed via `pnpm --filter web build` + a Playwright check of the built app's console (no CSP violations for script/style/connect; the only failures were an expected 404 for `/api/auth/me` since no API server was running behind that isolated check).

## Migration Plan

No data migration. Rollout is a normal deploy: new validation is stricter than before, so any *existing* stored Series titles/descriptions containing markup (unlikely, given the admin-only UI to date) would only be re-validated on the next edit, not retroactively rejected. No rollback complexity beyond reverting the change.
