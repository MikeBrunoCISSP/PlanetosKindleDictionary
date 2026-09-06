## Context

See proposal.md — Why. Design-relevant current state:

- `apps/api/src/index.ts:38` constructs Fastify with `Fastify({ logger: true })` — no `trustProxy`. Plugin order: `corsPlugin` → `securityPlugin` → `sessionPlugin` → `rateLimitPlugin` → `errorHandlerPlugin`, then routes.
- `apps/api/src/plugins/rateLimit.ts:13`: `keyGenerator: (request) => request.ip` — identical to `@fastify/rate-limit`'s own default key generator.
- `apps/api/src/routes/auth.ts:84`: `verifyTurnstile(secretKey, body.turnstileToken, request.ip)` — passes `request.ip` straight through to `apps/api/src/lib/turnstile.ts`'s `verify(secretKey, token, remoteIp?)`, which forwards it as `remoteip` in the Cloudflare siteverify request body.
- `apps/api/package.json` pins `fastify: ^5.0.0`, resolved to `fastify@5.12.1`. **Confirmed by reading the installed package**, not docs: Fastify's numeric `trustProxy` form (e.g. `trustProxy: 1`) is a deliberate no-op in this version — `node_modules/.pnpm/fastify@5.12.1/node_modules/fastify/lib/request.js` returns `function () { return false }` for `typeof tp === 'number'`, with the comment "Hop-count-only trust cannot validate the immediate peer. Fail closed so direct clients cannot spoof X-Forwarded-* values by supplying enough hops." This means the finding's literal suggested fix (a numeric hop count) would silently do nothing on this Fastify version.
- Fastify does support a custom trust `Function`, called as `(address, hop) => boolean`, where `hop` is the 0-based distance from the raw socket peer (`hop === 0` is the actual TCP peer). Traced through `@fastify/proxy-addr@5.1.0` and `@fastify/forwarded@3.0.2`: `forwarded()` returns `[socketAddr, ...xffEntriesFromRightToLeft]`, and the trust walk stops at the first untrusted hop, so `(address, hop) => hop < N` reproduces "trust exactly N hops back from the socket."
- `apps/api/src/config.ts` (PROD-002): `process.env` parsed once via `parseEnv()` into a frozen `Config`. `isStrict()` treats anything but `NODE_ENV=development|test` as strict. `validateEnv()` returns `[]` immediately outside strict mode (line ~92), so format checks — including `PORT`'s — only ever run in strict mode; they are "regardless of scope" (api vs. worker), not regardless of mode. "Operational" (non-secret) settings — `PORT`, `BUILD_CRON`, `S3_REGION` — always get a default via the `operational()` helper in every mode, independent of that strict-mode-only format check (the `PORT` regex at line ~170 is the closest precedent for the new setting).
- `apps/api/tests/helpers.ts`'s `buildApp()` returns `{ app, prisma }`, builds Fastify with no `trustProxy` and without `rateLimitPlugin`/`corsPlugin`/`securityPlugin` registered. Used unmodified by 16 existing test files.
- Railway's edge is documented (PROD-001) as the only public entry point to the `app` service; no internal load balancer layer is documented. This is asserted, consistent with how PROD-001's own topology notes are flagged as not independently re-verified with Railway support.

## Goals / Non-Goals

**Goals:**
- Make `request.ip` resolve to the real client through exactly one trusted proxy hop, using a mechanism that actually works on the pinned Fastify version.
- Keep the trusted hop count correctable by an operator without a code change, since it encodes a network-topology fact, not application logic.
- Make the new behavior testable given today's test-harness gap (no existing test sets forwarded headers or exercises rate limiting).

**Non-Goals:**
- IP/CIDR-based validation of the proxy's address (e.g. an allowlist of Railway's edge IP ranges) — not pursued because no such stable, documented range was found; the trust boundary here is a hop count, not an address check.
- Any monitoring/alerting for the underlying "container is never directly reachable" assumption becoming false — recorded as a residual risk with a documentation-only follow-up note (see Risks), not built in this change.
- Backfilling every existing "format checked but unspecified" configuration gap (e.g. `S3_ENDPOINT`) — only `PORT` is backfilled here, since it was already identified during this investigation; others are left alone.

## Decisions

### 1. Trust exactly one hop via a custom function, not the numeric or boolean form

**Decision:**
```ts
trustProxy: (_address, hop) => hop < config.trustProxyHops
```
passed to the `Fastify({...})` constructor in `index.ts`, with `config.trustProxyHops` defaulting to `1`.

**Reasoning:** the numeric form is a no-op on the pinned Fastify version (see Context). Boolean `true` would trust the entire client-suppliable `X-Forwarded-For` chain, including anything a client tacks on beyond the real proxy hop — exactly the failure mode the finding warns against. A custom function is the only mechanism on this Fastify version that reproduces "trust exactly N hops back from the socket," which is what the finding's own suggested fix actually meant.

**Alternative — IP/CIDR string or array of Railway's edge addresses**: would let Fastify validate the immediate peer's *identity*, not just its distance, closing the residual risk in Decision 3 more thoroughly. Rejected for this change because no stable, documented set of Railway edge source IPs/CIDRs was found to validate against; revisit if Railway publishes one.

### 2. Hop count is a config setting (`TRUST_PROXY_HOPS`), not a hardcoded constant

**Decision:** add `TRUST_PROXY_HOPS` to `config.ts` following the existing "operational setting" pattern (`PORT`, `BUILD_CRON`): always has a default (`1`, also the correct production value) in every mode, format-validated (non-negative integer) whenever set in strict mode, not treated as a secret.

**Reasoning:** this value encodes a fact about Railway's network topology. If that topology ever changes (e.g. an additional internal hop is introduced), an operator needs to be able to correct it with a Railway variable + redeploy, not wait on a code review cycle for what is, at that point, an active security misconfiguration. `0` is accepted as an explicit "trust nothing" kill switch.

**Alternative — hardcode `1` in `index.ts`**: simpler, but removes the operator's ability to correct a topology change without a code change. Rejected given the explicit precedent (`PORT`, `BUILD_CRON`) for exactly this kind of environment-correctable operational value.

### 3. No changes to `rateLimit.ts`, `turnstile.ts`, or `auth.ts`

**Decision:** leave all three untouched.

**Reasoning:** confirmed by reading both consumers — `rateLimit.ts`'s `keyGenerator: (request) => request.ip` is functionally identical to `@fastify/rate-limit`'s own default key generator, and `auth.ts:84` just reads `request.ip`. Fastify's `trustProxy` option changes what `request.ip` *returns* transparently at construction time via a getter on the decorated request; no other code path is involved. State this explicitly so a reviewer isn't looking for a missed diff in those files.

### 4. Test harness: additive options on `buildApp()`, new focused test files

**Decision:** extend `apps/api/tests/helpers.ts`'s `buildApp()` with an additive, optional `{ trustProxy?, rateLimit? }` parameter (default `{}` preserves today's exact behavior for the 16 existing call sites), and add:
- `apps/api/tests/trustProxy.test.ts` — trusted-hop resolution, spoofed-entry-beyond-trusted-hop rejection, no-`trustProxy` baseline, using `light-my-request`'s `remoteAddress` inject option (confirmed supported in the pinned version) to simulate the real socket peer.
- `apps/api/tests/rateLimit.test.ts` — per-resolved-client bucketing and limit-exceeded behavior behind a simulated single hop.
- Extensions to `apps/api/tests/lib/turnstile.test.ts` (assert the outgoing `remoteip` field) and `apps/api/tests/auth.test.ts` (one proxied-registration integration test asserting Turnstile receives the resolved, not raw, IP).
- Extension to `apps/api/tests/config.test.ts` for `TRUST_PROXY_HOPS` parsing/validation, following the existing `validateEnv`/`parseEnv` direct-call pattern.

**Reasoning:** `buildApp()` is shared by 16 test files; a breaking signature change would touch all of them for no benefit. An additive options object with a no-op default keeps the blast radius to the files that need the new behavior.

## Risks / Trade-offs

- **[Risk]** A hop-count-only trust function cannot itself distinguish "hop 0 is Railway's edge" from "hop 0 is an attacker who reached the container directly" — Fastify's own docs flag hop-count-only checks as unsafe if the origin is ever directly reachable. **Mitigation:** this is accepted as a documented, load-bearing assumption (the `app` container has no publicly reachable address other than via Railway's edge — standard Railway PaaS behavior, asserted and not independently re-verified with Railway support in this session, consistent with PROD-001's existing topology notes). Per explicit decision, no monitoring/detection tooling is built in this change; the runbook records the assumption and a suggested manual follow-up check as a note, not an enforced task.
- **[Risk]** If Railway's edge topology ever adds a second hop (e.g. an internal load balancer or CDN layer), `TRUST_PROXY_HOPS` must be updated to `2` or `request.ip` will silently resolve one hop too early (the edge's own address instead of the real client) — the same class of bug as today's finding, off by one, and nothing will automatically detect the drift. **Mitigation:** making it a config value rather than a hardcoded constant means this is fixable with a variable + redeploy; a code comment in `index.ts` points back at this change's rationale so a future engineer adding a proxy layer doesn't miss it.
- **[Trade-off]** The new tests prove the trust-function logic is correct in isolation (via simulated `remoteAddress`/`x-forwarded-for` values) but cannot prove Railway's edge actually behaves as assumed (appends rather than replaces, always sets exactly one entry). **Mitigation:** the runbook's operator-facing note recommends a manual post-deploy check (confirm via Railway logs that a real request's resolved client IP matches the actual requester) rather than treating the automated tests as sufficient proof of the live behavior.

## Migration Plan

Purely additive: a new config setting with a safe default and a constructor option. No schema or data changes, no breaking changes.

1. Land the `config.ts` / `index.ts` / test / documentation changes together.
2. Deploy: `TRUST_PROXY_HOPS` needs no operator action for the default case (falls back to `1` in every mode). An operator only sets it explicitly if Railway's topology is ever known to differ.
3. Post-deploy (operator, documented in the runbook, not automated): confirm via `railway logs` that a real request's resolved client IP matches the actual requester, not Railway's internal edge address.

Rollback: revert the change; this returns to today's untrusted-proxy behavior (`request.ip` resolves to the proxy), reinstating the documented finding.
