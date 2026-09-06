## Why

Fastify is constructed with no `trustProxy` option, so `request.ip` resolves
to Railway's edge proxy, not the real client, behind the deployed `app`
service. Rate limiting keys its buckets on `request.ip`, so unrelated users
behind the same proxy hop share one bucket and can lock each other out.
Cloudflare Turnstile verification also forwards `request.ip` as `remoteip`,
so it receives the proxy's address instead of the real client, weakening
diagnostics and verification (finding SEC-001, high severity).

## What Changes

- Construct Fastify with a `trustProxy` option that trusts exactly one hop
  (a custom function, not Fastify's numeric `trustProxy` form, which is a
  documented no-op in the pinned Fastify version — see design.md), so
  `request.ip` resolves to the client Railway's edge actually saw, and a
  client-supplied `X-Forwarded-For` entry beyond that one trusted hop is
  ignored.
- Add a new `TRUST_PROXY_HOPS` operational config setting (default `1`),
  following the existing `config.ts` pattern for non-secret, always-defaulted
  settings, so an operator can correct the trusted hop count without a code
  change if Railway's proxy topology ever changes.
- No changes to the rate-limit key generator or the Turnstile call site —
  both already read `request.ip`, which Fastify resolves transparently once
  `trustProxy` is set.
- Extend the test harness (`apps/api/tests/helpers.ts`) with additive,
  opt-in `trustProxy`/`rateLimit` options so proxied-request behavior is
  testable, and add tests covering: a trusted single hop resolving the real
  client, a spoofed forwarded-for entry beyond the trusted hop being ignored,
  independent rate-limit buckets per resolved client, and Turnstile
  receiving the resolved client IP.
- Document the single-trusted-hop assumption and its residual risk (a
  hop-count check can't itself distinguish Railway's edge from a client that
  reached the container directly) in the deployment runbook, plus backfill a
  missing `PORT` spec requirement found during this work.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `security/input-hardening`: adds requirements that the resolved client IP
  (used by rate limiting and Turnstile) reflects the real client through
  exactly one trusted proxy hop, and that forwarded-for entries beyond that
  hop are ignored.
- `security/configuration`: adds the `TRUST_PROXY_HOPS` operational setting
  (default, always-validated format) to the configuration contract, and adds
  the previously-undocumented `PORT` format-validation requirement.

## Impact

- `apps/api/src/config.ts` — new `TRUST_PROXY_HOPS` field (`Config`,
  `DEV_DEFAULTS`, `parseEnv`, `validateEnv`).
- `apps/api/src/index.ts` — `trustProxy` passed to the Fastify constructor.
- `apps/api/tests/helpers.ts` — additive `buildApp()` options.
- `apps/api/tests/trustProxy.test.ts` (new), `apps/api/tests/rateLimit.test.ts`
  (new), `apps/api/tests/lib/turnstile.test.ts`, `apps/api/tests/auth.test.ts`,
  `apps/api/tests/config.test.ts` (extended).
- `infra/railway/README.md`, `.env.example`, `SPEC.md` — documentation.
- No changes to `apps/api/src/plugins/rateLimit.ts`,
  `apps/api/src/lib/turnstile.ts`, `apps/api/src/routes/auth.ts`, or
  `apps/api/src/worker.ts`.
