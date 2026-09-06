## Context

See proposal.md — Why. Design-relevant current state:

- `apps/api/src/index.ts:81`: `app.get("/health", async () => ({ status: "ok" }));` — no checks. `.railway/railway.ts`'s `app` service has `healthcheckPath: "/health"` and no `healthcheckTimeout`. `/health` has exactly three references repo-wide: the route itself, that IaC field, and a verification curl step in `infra/railway/README.md`.
- `apps/api/src/lib/storage.ts:97`, `ensureBucketExists()`: HEAD-checks the bucket, falls back to `CreateBucket`, and on any further failure `console.warn`s and returns — its own docstring documents this as intentional ("Fails soft... never throws," for environments with scoped IAM credentials that can't `CreateBucket`). Called from both `index.ts` and `worker.ts` at startup, awaited, but never blocks either.
- `apps/api/src/worker.ts`: calls `assertConfigValid("worker")` (PROD-002) then unconditionally proceeds through `new PrismaClient()` → `ensureBucketExists()` → constructs two BullMQ `Worker`s → `upsertJobScheduler()` → logs "started." No connectivity check occurs before the worker registers to process jobs.
- No shared Prisma/Redis singleton exists. `index.ts` and `worker.ts` each construct their own `PrismaClient`. Three independent Redis clients exist (`plugins/session.ts`, `plugins/rateLimit.ts`, `lib/queues.ts`'s private `getConnection()`), all pointed at the same `config.redisUrl`.
- Confirmed via `railway/iac`'s type definitions (`node_modules/.pnpm/railway@3.11.0/node_modules/railway/dist/index-C3uk0ruc.d.ts:84-93`): `healthcheckPath`, `healthcheckTimeout`, `restartPolicyType`, and `restartPolicyMaxRetries` are all supported `DeployConfig` fields. Only `healthcheckPath` is set today.

## Goals / Non-Goals

**Goals:**
- Make `/health` an honest signal Railway's deployment healthcheck can act on.
- Make the worker refuse to start accepting jobs against an unusable dependency.
- Keep probe cost bounded and cheap enough not to become a load problem of its own.

**Non-Goals:**
- Continuous monitoring/alerting — explicitly out of scope per the finding; Railway's deployment healthcheck is a one-time promotion gate, not an ongoing monitor.
- Changing `ensureBucketExists()`'s fail-soft contract — that behavior is intentional for its own purpose (local/dev bootstrap convenience) and stays as-is; the worker's new preflight is a separate, stricter check.
- A Kubernetes-style liveness/readiness/startup-probe triad — this topology has one healthcheck consumer with one purpose.
- Setting `restartPolicyType` on `worker` — a reasonable follow-up, not required by the acceptance criteria.

## Decisions

### 1. Repurpose `/health` as the readiness check; no second endpoint

**Decision:** change what `/health` returns rather than adding `/health/ready` or similar.

**Reasoning:** `/health` has exactly one consumer in this repo — Railway's `healthcheckPath`, used only as a promotion gate during a deploy. A liveness/readiness split earns its complexity when something needs "process is up" independently of "dependencies are reachable" (e.g., an orchestrator that restarts on liveness failure separately from a routing decision); nothing here does that. A second route would be two things to maintain and document for one consumer that only ever calls one path.

**Alternative — add `/health/ready` alongside a `/health` that stays a trivial 200**: rejected; it doesn't serve any consumer this repo has, and risks confusing future readers into wondering which one Railway actually checks.

### 2. API readiness: PostgreSQL + Redis only, not storage

**Decision:** `/health` checks PostgreSQL and Redis. Object storage is checked only by the worker's preflight (Decision 4), not by API readiness.

**Reasoning:** the acceptance criteria require storage misconfiguration to block the *worker*, not the API. The API's only storage touchpoint is presigned-URL generation — pure local signing, no network call to S3. Nothing on the API's request path fails the instant the bucket becomes unreachable. Probing storage on every readiness check would add cost to the API's promotion gate for a dependency it doesn't need at that moment; `app` and `worker` share the identical `s3Vars` block in `.railway/railway.ts`, so a real misconfiguration is already caught by the worker's own gate.

**Flagged trade-off:** a reviewer wanting defense-in-depth could ask for storage in API readiness too. Not required by the acceptance criteria; left out to keep the promotion gate cheap and focused on what actually breaks API requests.

### 3. Probe implementation: bounded timeouts + short-TTL cache

**Decision:** `apps/api/src/lib/health.ts` exports `checkPostgres(prisma)` (a `prisma.$queryRaw` `SELECT 1`), `checkRedis(connection)` (a `PING` against a passed-in ioredis client), and `checkStorage()` (a `HeadBucketCommand`, no `CreateBucket` fallback). Each is wrapped in an individual timeout (**1500ms**). `checkReadiness(prisma)` runs Postgres + Redis concurrently via `Promise.all`, caches the combined result for **2000ms** (module-level `{ result, expiresAt }`), and is what `/health` calls. `runPreflight()` runs all three checks with retry/backoff (3 attempts, 500ms/1s/2s delays) and is what the worker calls before registering.

The API's Redis check uses a dedicated, lazily-constructed connection owned by `lib/health.ts` — not the session or rate-limit plugins' clients, to avoid the readiness path touching connections that also carry production traffic. The worker's preflight instead probes `lib/queues.ts`'s actual connection (see Decision 4), since proving *that* connection works is what matters for the worker specifically.

**Reasoning for the constants:** 1500ms per probe keeps `/health`'s worst case (~1.5s for two concurrent probes) comfortably under a `healthcheckTimeout` of 10s (Decision 6). The 2000ms cache protects Postgres/Redis from Railway's polling cadence during a deploy, which isn't documented anywhere in this repo — the cache is a defensive measure rather than a value tuned to a known interval. Both are named constants, flagged as tunable defaults.

**Alternative — no caching, probe fresh every request**: rejected as needlessly expensive under repeated polling with no offsetting benefit (a 2-second-stale readiness verdict is immaterial to a promotion decision that itself takes longer than that to resolve).

### 4. Worker preflight, and exporting `lib/queues.ts`'s connection

**Decision:** `worker.ts` calls `runPreflight()` immediately after `assertConfigValid("worker")` and before constructing any `Worker` or calling `upsertJobScheduler`. On exhausted retries, it logs which dependency failed and calls `process.exit(1)`.

`lib/queues.ts`'s `getConnection()` becomes exported (currently private; only `getDictionaryBuildQueue()`, `getMaintenanceQueue()`, `closeQueues()` are exported) so the worker's preflight can `PING` the exact Redis connection BullMQ will use, rather than opening a redundant fourth Redis connection or reaching into `queue.opts.connection`.

**Reasoning for retry/backoff over failing immediately:** a Postgres/Redis service can still be coming up in the same deploy window the worker starts in (`railway config apply` provisions/updates several services together). Failing immediately on that ordinary race would make routine deploys flaky. Railway's platform-level restart-on-crash behavior isn't documented locally, and `restartPolicyType`/`restartPolicyMaxRetries` are unset today — this change relies on Railway's undocumented default for the "genuinely broken" case and uses its own short in-process retry only for the "still starting up" case. This is an explicit assumption, not validated against Railway's actual behavior in this session.

**Alternative — fail immediately, rely entirely on Railway's restart policy**: rejected; without a documented/confirmed restart policy, an ordinary startup race could flap the worker or leave it down longer than necessary for no benefit.

### 5. `lib/storage.ts` refactor: shared `HeadBucketCommand` primitive

**Decision:** extract the `HeadBucketCommand` call into a small internal helper, used by both `ensureBucketExists()` (unchanged behavior — still falls back to `CreateBucket`, still fails soft) and `lib/health.ts`'s `checkStorage()` (fails loud — no fallback, no swallowed errors). One place issues that specific S3 call.

### 6. `.railway/railway.ts`: explicit `healthcheckTimeout` on `app`

**Decision:** set `healthcheckTimeout: 10` (seconds) on the `app` service. Confirmed the field exists and is supported (see Context). `/health` is no longer a trivial instant-200 handler, so relying on Railway's undocumented default is no longer appropriate — 10s is comfortably above the new route's bounded worst case (~1.5s) while still failing a genuinely broken deploy promptly. `worker` has no equivalent field — it's a private, HTTP-less service, and Railway healthchecks are HTTP-only.

## Risks / Trade-offs

- **[Risk]** A fourth Redis connection is introduced (the API's dedicated health-check client, separate from session/rateLimit/queues). **Mitigation:** each existing connection is already plugin-owned and connects independently; the alternative (reusing `plugins/session.ts`'s client) would couple a route to a plugin's internals. Flagged in case there's a connection-count concern on the managed Redis plan.
- **[Risk]** The 1500ms probe timeout, 2000ms cache TTL, and 3-attempt/500ms-1s-2s retry schedule are reasonable defaults, not validated against Railway's actual (locally undocumented) healthcheck polling cadence or restart behavior. **Mitigation:** named constants, called out here and in the proposal as tunable; can be adjusted without a spec change if real-world behavior differs.
- **[Trade-off]** `/health`'s response contract changes from a fixed `{"status":"ok"}`/200-always to a conditional 200/503 with a `checks` body — a breaking change to that one endpoint. **Mitigation:** confirmed low blast radius (only the runbook's curl step and the IaC's `healthcheckPath` consume it; no application code depends on the response shape); called out explicitly in the proposal as **BREAKING**.
- **[Trade-off]** Storage is excluded from API readiness (Decision 2) — accepted as intentional scope, not a gap, since the acceptance criteria don't require it and the worker's gate already covers the real failure mode.

## Migration Plan

Purely additive to the deployment lifecycle; no schema or data changes.

1. Land the code, IaC, and doc changes together.
2. Operator: `railway config plan` → `railway config apply` picks up `app`'s new `healthcheckTimeout`. No new variables to set.
3. Post-deploy: confirm `curl https://<app-domain>/health` returns 200 with a `checks` body reporting both dependencies healthy.

Rollback: revert the change; `/health` returns to an unconditional 200 and the worker returns to starting regardless of dependency state, reinstating the documented finding.
