## Why

The repository cannot be deployed. It is a pnpm-workspaces monorepo (`apps/api`, `apps/web`, `packages/{shared,kindle}`) with no Railway config, no Dockerfile/Procfile, no production static-file server, and no production web start command. The web SPA issues every API call to a relative `/api` URL that only the dev-time Vite proxy resolves, and the BullMQ worker is a second entrypoint of the `api` package that nothing starts outside `pnpm dev`. A default Railway import produces a broken app. This blocks hosting the application anywhere.

## What Changes

- **The API also serves the built SPA (single public origin).** `apps/api` registers `@fastify/static` for `apps/web/dist` plus an SPA history fallback. `/api/*`, `/admin/jobs` (Bull Board), and `/health` keep their current behavior; an unmatched `/api/*` path still returns an RFC 9457 `application/problem+json` response, never `index.html`. Because the browser now talks to one origin, the SPA's relative `/api` calls, its `<meta>` CSP (`connect-src 'self'`), and the `SameSite=Lax` session cookie all work unchanged — no web, CORS, CSP, or cookie changes.
- **A deterministic production build.** A single build command builds `packages/*`, runs `prisma generate` explicitly (pnpm's `onlyBuiltDependencies` allowlist blocks the `@prisma/client` postinstall), builds `apps/web`, then builds `apps/api`. Pending Prisma migrations run as the `app` service's pre-deploy step (`prisma migrate deploy`) — on the app only, never the worker.
- **Railway project defined as code** in `.railway/railway.ts` (TypeScript Infrastructure as Code): a public `app` service and a private `worker` service (both sourced from the GitHub repo, same build, different start command and watch paths), a managed `postgres`, a managed `redis`, and a Railway `bucket`, with variable wiring (`DATABASE_URL`, `REDIS_URL`, `PUBLIC_BASE_URL`, `S3_*`, `NODE_ENV=production`) and operator secrets left as `preserve()`.
- **GitHub is the deployment mechanism.** Services deploy from the connected GitHub repo; a push to the default branch builds and releases them. Docker-image deploys are documented only as a fallback.
- **`infra/railway/README.md`** — an operator runbook covering everything that cannot be code: creating the Railway account, connecting the GitHub repo, running `railway config apply`, setting secret values, the one-time first `migrate deploy` + `seed`, attaching a custom domain, redeploy-on-push, rollback, and logs.
- **Documentation** — `.env.example` and `SPEC.md` §3/§10 mark which variables Railway provides versus which the operator must set; the root `README.md` gains a production section that points at the runbook.
- Everything runs on Railway (Postgres, Redis, and object storage are Railway-managed resources in the same project over private networking). The only external dependency is SMTP (`SMTP_URL`) — Railway has no managed email service.

Not in scope: fail-fast startup configuration validation (finding PROD-002, which depends on this change); a committed Dockerfile / image-registry pipeline; CI changes; a staging environment beyond a note in the runbook.

## Capabilities

### New Capabilities

- `deployment/railway`: The production deployment topology and its observable guarantees — a single public origin that serves both the SPA and the API with a working browser session, an independently-running worker on the same Redis queues, migrations applied before traffic, GitHub-triggered releases with scoped rebuilds, build artifacts persisted to the production bucket, absolute URLs anchored to the public origin, and operator secrets supplied externally rather than committed.

### Modified Capabilities

<!-- none — no existing requirement changes; this adds deployment behavior that no current spec covers -->

## Impact

- **`apps/api`** — new direct dependency `@fastify/static` (already present transitively at 9.3.0); `src/index.ts` gains static serving + an SPA `setNotFoundHandler` registered after all routes; a small helper to locate `apps/web/dist` relative to the compiled entrypoint.
- **Build tooling** — root `package.json` gains a deterministic build script (package builds → `prisma generate` → web build → api build); Node version pinned via `engines` and `RAILPACK_NODE_VERSION`.
- **New files** — `.railway/railway.ts` (+ `railway/iac` dev dependency), `infra/railway/README.md`.
- **Docs** — `.env.example`, `SPEC.md` §3 and §10, root `README.md`.
- **Runtime / infrastructure** — Railway project with `app` + `worker` services, managed Postgres + Redis, one Railway bucket; the existing `S3_*` / `@aws-sdk/client-s3` code targets the Railway bucket unchanged (path-style via `S3_ENDPOINT`).
- **No changes** to `apps/web` source, the CSP, CORS, the session/cookie configuration, or any API route contract.
