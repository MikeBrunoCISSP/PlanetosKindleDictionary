## Context

See proposal.md — Why. Design-relevant current state:

- **Monorepo**: pnpm workspaces. `apps/api` (Fastify + Prisma + BullMQ; `src/index.ts` is the server, `src/worker.ts` is the worker — same package, `start` / `start:worker`). `apps/web` (Vite React SPA). `packages/shared`, `packages/kindle`. Root `package.json` orchestrates builds.
- **Web ↔ API coupling**: all 17 calls in `apps/web/src/lib/api.ts` use `fetch("/api/...", { credentials: "include" })`. `apps/web/vite.config.ts` proxies `/api` → `localhost:3000` **for dev only**. `apps/web/index.html` carries a `<meta>` CSP with `connect-src 'self' https://challenges.cloudflare.com`.
- **Session**: `@fastify/session` over Redis, cookie `httpOnly; sameSite=lax; secure=(NODE_ENV==="production")` (`apps/api/src/plugins/session.ts`). A Lax first-party cookie is sent on top-level and same-site XHR — it works same-origin, breaks cross-origin.
- **API boot** (`apps/api/src/index.ts`): `dotenv` loads `../../../.env` (a no-op when the file is absent), registers `cors` (origin = `PUBLIC_BASE_URL ?? localhost:5173`), `security` (helmet, CSP **off** — comment says the API only returns JSON), `session`, `rateLimit`, `errorHandler` (RFC 9457), then route plugins, then Bull Board at `/admin/jobs` (admin-guarded), then `GET /health`, then `ensureBucketExists()`, then `listen({ port: PORT ?? 3000, host: "0.0.0.0" })`.
- **Config reads** are ad hoc `process.env[...]` across `session.ts`, `cors.ts`, `rateLimit.ts`, `lib/{queues,mailer,storage,crypto}.ts`, `routes/auth.ts` (3× `PUBLIC_BASE_URL` for email links), `worker.ts` (`BUILD_CRON`), `prisma/seed.ts` (`ADMIN_*`). `lib/crypto.ts` already throws if `SETTINGS_ENCRYPTION_KEY` is missing/short.
- **Prisma**: `generator client` is default output. There is **no** `prisma generate` script and **no** `postinstall`; pnpm's `onlyBuiltDependencies` (in `pnpm-workspace.yaml`) lists only `esbuild` / `msgpackr-extract`, so `@prisma/client`'s own postinstall generate is blocked. The client is generated today as a side effect of `prisma migrate dev` during local work.
- **Storage** (`lib/storage.ts`): `@aws-sdk/client-s3`, lazy client. `S3_ENDPOINT` set ⇒ path-style addressing (MinIO / self-hosted). `ensureBucketExists()` fails soft.
- **Railway model** (from the `use-railway` plugin references): shared-monorepo services keep full repo context and scope via build/start commands + `watchPatterns` (never `rootDirectory` when packages are shared); Railpack builds from source, no Dockerfile needed; TypeScript IaC (`.railway/railway.ts`) is preferred for TS repos and expresses the whole project graph; `railway config plan` / `apply` is the deploy-from-source-of-truth loop; managed Postgres/Redis and native buckets wire in via `${{Service.VAR}}` references.

## Goals / Non-Goals

**Goals:**

- One reviewable source-of-truth file (`.railway/railway.ts`) that stands up the whole project graph.
- Zero changes to `apps/web`, the CSP, CORS behavior, cookies, or any route contract.
- A build that is byte-for-byte reproducible from a clean checkout and a start command that needs only environment variables.
- A runbook precise enough that the operator's only decisions are account/workspace, the GitHub connection, secret values, and (optionally) a custom domain.

**Non-Goals:**

- A configuration module that validates env and fails fast — that is finding PROD-002, sequenced after this. This change only *documents* the required set and fixes `PUBLIC_BASE_URL` semantics.
- A committed Dockerfile or image-registry pipeline. Railpack builds from source; the image path is a documented fallback only.
- Multi-environment (staging) setup, CI workflow changes, blue/green beyond what Railway does by default.
- Refactoring the ad hoc `process.env` reads into an injected config object (PROD-002).

## Decisions

### 1. The API process serves the SPA — one public service, not three

Register `@fastify/static` pointed at the built `apps/web/dist`, then a `setNotFoundHandler` that returns `dist/index.html` (status 200) for any unmatched **non-`/api`, non-`/admin`** GET, and delegates everything else to the existing error handler (so unknown `/api/*` stays `application/problem+json`). Registered **after** all route plugins and Bull Board so it only catches leftovers. `dist` is located relative to the compiled entry (`apps/api/dist/index.js` → `../../web/dist`), resolved from `import.meta.url`, existence-checked at boot with a warning log if absent (keeps `app.inject()` tests, which never build the web app, working).

- *Why over a separate static `web` service that reverse-proxies `/api`*: that needs a proxy process (Caddy/nginx/node) to build, deploy, and reason about, and gains nothing here — the API is already an always-on HTTP server.
- *Why over separate public origins for web and api*: would force `SameSite=None; Secure` cookies, credentialed CORS, a build-time `VITE_API_BASE_URL`, and a wider CSP `connect-src` — four changes across security-sensitive code, for a topology the finding itself calls the harder path.
- *Consequence*: helmet CSP stays off; the SPA keeps its `<meta>` CSP (already correct — `connect-src 'self'` covers the shared origin, and Turnstile is already allow-listed). `@fastify/cors` stays registered but is inert for same-origin requests; its `origin` is sourced from `PUBLIC_BASE_URL` so it remains correct if a second origin is ever added.

### 2. `.railway/railway.ts` (TypeScript IaC) is the project definition

The repo is TypeScript, so per the Railway guidance TS IaC is preferred over `railway.json`. `railway.json` only covers one service's build/deploy settings — it cannot express the Postgres, Redis, bucket, or the cross-service variable wiring this topology needs. The file declares:

- `postgres()`, `redis()`, `bucket("dictionaries", { region })`.
- `app` service: `source: github("<owner/repo>", { branch: "main" })`, `build` = the deterministic build command (Decision 3), `start` = `pnpm --filter @planetos/api start`, `preDeploy` = `pnpm --filter @planetos/api exec prisma migrate deploy`, `healthcheckPath: "/health"`, a generated public domain, `watchPatterns` covering `apps/api/**`, `apps/web/**`, `packages/**`, the lockfile, and `.railway/**`. `env`: `DATABASE_URL` / `REDIS_URL` from the managed services, `PUBLIC_BASE_URL` = the app's own public domain, `S3_*` from the bucket credentials, `NODE_ENV=production`; `SESSION_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `SMTP_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and Turnstile keys as `preserve()` (operator-set, never in source).
- `worker` service: same `source` and `build`, `start` = `pnpm --filter @planetos/api start:worker`, **no** domain, **no** `preDeploy`, `watchPatterns` scoped to `apps/api/**`, `packages/kindle/**`, `packages/shared/**`, the lockfile, `.railway/**`. `env`: `DATABASE_URL`, `REDIS_URL`, `S3_*`, `NODE_ENV=production`, plus `SETTINGS_ENCRYPTION_KEY` (the build job decrypts the Turnstile secret) as `preserve()`.

The deploy loop is `railway config plan` → operator review → `railway config apply`; thereafter GitHub push-to-`main` auto-deploys. Adds one dev dependency, `railway/iac`.

### 3. Deterministic build command

A single root script (e.g. `build:railway`): `pnpm --filter @planetos/shared build && pnpm --filter @planetos/kindle build && pnpm --filter @planetos/api exec prisma generate && pnpm --filter web build && pnpm --filter @planetos/api build`. Ordering matters: `shared` and `kindle` first (both apps import them); `prisma generate` before `apps/api` `tsc` (types reference the generated client); `web` before or after `api` (independent). Railpack runs `pnpm install --frozen-lockfile` itself. Node is pinned by root `engines.node` and `RAILPACK_NODE_VERSION` so Railpack and local agree.

- *Why explicit `prisma generate`*: pnpm blocks the `@prisma/client` postinstall (Context). Without this line the API build fails on missing generated types.

### 4. Migrations run pre-deploy on the API service only

`prisma migrate deploy` as the `app` `preDeployCommand`. Railway runs it after build, before routing traffic to the new version; a non-zero exit fails the deploy and leaves the old version live — satisfying the "failed migration does not take the app offline" requirement. It is **not** set on the worker: two services running `migrate deploy` concurrently on the same database is a race with no upside. The one-time `seed` (needs `ADMIN_*`, idempotent) is a documented `railway run pnpm --filter @planetos/api seed`, not wired into every deploy.

### 5. `PUBLIC_BASE_URL` becomes the single public origin

It already feeds both the CORS origin and the three email-link builders in `routes/auth.ts`. In the deployed topology it is set to the `app` service's public domain. No code change beyond documenting it; the existing `?? "http://localhost:5173"` fallbacks stay for local dev.

### 6. Railway managed bucket via the existing `S3_*` contract

`railway bucket` credentials map onto `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_REGION`. `S3_ENDPOINT` is set, so `lib/storage.ts` uses path-style addressing — correct for Railway's S3-compatible gateway. `ensureBucketExists()` stays as-is: `HeadBucket` succeeds against the pre-provisioned bucket, and its fail-soft `CreateBucket` fallback is harmless.

### 7. Runbook location and scope

`infra/railway/README.md` (next to `infra/docker-compose.yml`). Covers: create account / pick workspace; connect the GitHub repo; `railway config plan` + `apply`; set each operator secret (with how to generate `SESSION_SECRET` / `SETTINGS_ENCRYPTION_KEY`, and the SMTP-provider note); first `migrate deploy` (automatic) + one-time `seed`; attach a custom domain + DNS records + set `PUBLIC_BASE_URL`; redeploy-on-push; rollback (`railway redeploy` / previous deployment); logs (`railway logs`); and the Docker-image fallback path in brief.

## Risks / Trade-offs

- [Risk] `railway/iac` is comparatively new; `config apply` semantics or the DSL may shift. → The runbook documents the equivalent dashboard/CLI steps so a stuck `apply` is not a dead end; `railway.ts` stays small and declarative.
- [Risk] `web/dist` path resolution differs if the compiled layout ever changes (e.g. `tsc` output flattening). → Resolve from `import.meta.url`, existence-check at boot with a clear warning, and cover it in the local production-mode smoke test.
- [Risk] First `railway config apply` ordering — the `app` `preDeployCommand` needs Postgres to exist. → The same `apply` provisions Postgres and Railway orders resource creation before the first deploy; if the very first deploy still races, a redeploy after apply resolves it (documented).
- [Risk] SPA fallback could shadow a future non-`/api` server route or a Bull Board asset path. → Fallback is GET-only and explicitly excludes `/api` and `/admin`; new server routes must be under `/api`.
- [Risk] Session cookie requires `secure=true` in production (already gated on `NODE_ENV`), which requires HTTPS. → Railway terminates TLS on the public domain by default; the runbook calls out that `NODE_ENV=production` must be set (it is, in `railway.ts`).
- [Trade-off] "Web" and "API" are one process, not two services, so the finding's literal "explicit web, API, and worker services" becomes two app services (`app`, `worker`) plus managed data services. This is the recommended same-origin topology and every acceptance criterion still holds; noted in the proposal.
- [Trade-off] No fail-fast config validation yet — a missing `SESSION_SECRET` still silently uses the committed dev fallback. Bounded by sequencing PROD-002 immediately after and by the runbook's explicit required-vars checklist.

## Migration Plan

This is additive — no existing deployment to migrate. Rollout:

1. Land the code + `.railway/railway.ts` + runbook + docs on `main`.
2. Operator: create the Railway project, connect the GitHub repo, `railway config plan` → review → `railway config apply` (provisions `app`, `worker`, Postgres, Redis, bucket).
3. Operator: set the operator secrets; set `PUBLIC_BASE_URL` to the generated domain (or the custom domain once DNS resolves).
4. First deploy runs `prisma migrate deploy` automatically; operator runs `seed` once.
5. Verify per tasks.md (local production-mode smoke, then the live acceptance checks in the runbook).

Rollback: `railway redeploy` the previous good deployment, or disconnect auto-deploy. The code changes are backward-compatible with local dev (`pnpm dev` unaffected; fallbacks intact), so reverting the repo change is also safe.

## Open Questions

- Custom domain vs. the generated `*.up.railway.app` for the first go-live — deferrable; the runbook covers both and only `PUBLIC_BASE_URL` + a DNS record differ.
- Railway Postgres backup cadence / retention on the chosen plan — an operational setting the operator confirms in the dashboard; does not affect specs, approach, or tasks.
