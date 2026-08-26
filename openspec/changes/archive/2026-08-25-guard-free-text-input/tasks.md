## 1. Shared validation helper

- [x] 1.1 Add `packages/shared/src/validation.ts` exporting a `plainText({ min, max })` Zod schema factory that rejects strings containing HTML tag syntax and enforces the given length bounds; verify with unit tests covering: a `<script>...</script>` payload is rejected, plain punctuation-heavy text is accepted, and a string over `max` is rejected.
- [x] 1.2 Update `packages/shared/src/series.ts` to build `title` (max 200) and `description` (max 5000) using `plainText` instead of raw `z.string().min(1, ...)`, in both `createSeriesSchema` and `updateSeriesSchema`.

## 2. API test coverage

- [x] 2.1 Extend `apps/api/tests/series.test.ts` with cases for `POST /api/series` and `PATCH /api/series/:slug`: markup in `title`/`description` returns 400, over-length input returns 400, ordinary text is accepted and persisted; verify by running `pnpm --filter api test`.

## 3. CORS

- [x] 3.1 Add `@fastify/cors` to `apps/api/package.json`.
- [x] 3.2 Add `apps/api/src/plugins/cors.ts` (following the shape of `apps/api/src/plugins/rateLimit.ts`) registering `@fastify/cors` with `origin: process.env.PUBLIC_BASE_URL` and `credentials: true`.
- [x] 3.3 Register the CORS plugin in `apps/api/src/index.ts` before the route plugins; verify a request with `Origin: <PUBLIC_BASE_URL>` receives permissive CORS headers and a request with an arbitrary other `Origin` does not.

## 4. HTTP hardening headers

- [x] 4.1 Add `@fastify/helmet` to `apps/api/package.json`.
- [x] 4.2 Add `apps/api/src/plugins/security.ts` registering `@fastify/helmet` with its `contentSecurityPolicy` directive disabled (with a comment explaining the API returns JSON, not documents) and other default headers enabled.
- [x] 4.3 Register the security plugin in `apps/api/src/index.ts`; verify via a manual request (curl or devtools) that responses include `x-content-type-options: nosniff` and a `referrer-policy` header.

## 5. Web CSP

- [x] 5.1 Add a `<meta http-equiv="Content-Security-Policy">` tag to `apps/web/index.html` with `default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'` (no separate API origin needed - the app only ever fetches relative `/api/...` paths). Also extracted the inline dark-mode-init `<script>` to `public/theme-init.js` since `script-src 'self'` (correctly) blocks inline scripts.
- [x] 5.2 Ran `pnpm --filter web build` and verified the built app in a real browser (Playwright, via `vite preview`): zero CSP violations for scripts/styles/connect. Dropped `frame-ancestors` from the meta tag after confirming (via a browser console warning) that directive has no effect in a `<meta>` CSP.

## 6. Lint enforcement

- [x] 6.1 Add a `react/no-danger` (or equivalent) ESLint rule to the web app's lint config so any `dangerouslySetInnerHTML` usage fails lint; verify by temporarily adding a test usage and confirming `pnpm --filter web lint` fails, then removing it. (No ESLint existed in this repo at all - added a minimal flat config with only this rule, not a full recommended baseline, to avoid dragging in unrelated pre-existing lint debt; see design.md.)
- [x] 6.2 Add an ESLint `no-restricted-syntax` rule to the API's lint config blocking calls to `$queryRawUnsafe`/`$executeRawUnsafe`; verify by temporarily adding a test call and confirming `pnpm --filter api lint` fails, then removing it. (Same minimal-config approach; also added the missing `lint` script to `apps/api/package.json`.)
- [x] 6.3 Document the "no raw/unparameterized SQL" and "no unsanitized HTML rendering" conventions in CLAUDE.md (or the project's existing conventions doc). (No CLAUDE.md existed - created one at the repo root.)

## 7. End-to-end verification

- [x] 7.1 Ran the full app locally against real Postgres/Redis; through an actual browser (Playwright), logged in as admin and submitted the Create Dictionary form with `<script>alert(1)</script>` as the title - blocked client-side with "Must not contain HTML markup", nothing persisted. Submitted a normal title/description with punctuation and quotes - saved successfully, and confirmed via the API that the stored value matched exactly (no mangling). Cleaned up the test record afterward.
- [x] 7.2 `pnpm --filter web build` succeeds cleanly. `pnpm --filter api test`: all new/changed tests pass (44/46); the 2 failures are pre-existing and unrelated - leftover seeded data (an `ASOIAF` series and an extra admin user) in the local dev database pollutes two empty-state/last-admin-count assertions in `series.test.ts`/`admin.test.ts` that predate this change and don't touch series validation, CORS, or headers.
