## Why

Every production-critical setting in `apps/api` is read ad hoc from `process.env` with a development fallback (finding PROD-002). `SESSION_SECRET` falls back to a **committed** string (`apps/api/src/plugins/session.ts:20`); `REDIS_URL`, `SMTP_URL`, `PUBLIC_BASE_URL`, and the `S3_*` credentials fall back to localhost or empty values across `cors.ts`, `rateLimit.ts`, `lib/queues.ts`, `lib/mailer.ts`, `lib/storage.ts`, and `routes/auth.ts`. Nothing validates configuration at startup. A Railway deployment that forgets a variable boots successfully and then either signs sessions with a publicly known secret, emails `localhost` verification links, accepts the wrong CORS origin, or fails only later when a user first triggers Redis / mail / storage. The known session secret is an authentication-integrity hole.

## What Changes

- **One startup configuration module** (`apps/api/src/config.ts`) parses `process.env` **once** through a `zod` schema and exports a frozen, typed `config` object. A tiny `apps/api/src/load-env.ts` runs `dotenv` and is imported first by every entrypoint and by `config.ts`, so `.env` is loaded before any value is read (this also removes the lazy `??=` workarounds in `lib/{queues,mailer,storage}.ts`).
- **Fail-fast in production.** Validation is strict unless `NODE_ENV` is explicitly `development` or `test`. In strict mode, missing or malformed required variables abort startup: the process prints one aggregated error naming every offending variable and exits non-zero **before** Fastify or the worker is constructed. In `development`/`test` the current local defaults still apply.
- **Stronger rules for secrets and URLs.** In strict mode `SESSION_SECRET` and `SETTINGS_ENCRYPTION_KEY` must be ≥ 32 characters and must not be a known placeholder (the committed fallback, the `.env.example` `change-me-…` strings). `PUBLIC_BASE_URL` and `SMTP_URL` must be absolute URLs of the right scheme; `PUBLIC_BASE_URL` must not resolve to `localhost` / `127.0.0.1`. `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` must be non-empty. `PORT` must be numeric.
- **All consumers read `config`.** `session.ts`, `cors.ts`, `rateLimit.ts`, `lib/queues.ts`, `lib/mailer.ts`, `lib/storage.ts`, `lib/crypto.ts`, `routes/auth.ts` (email links), `index.ts` (`PORT`), and `worker.ts` (`BUILD_CRON`) stop reading `process.env` directly. `lib/crypto.ts`'s existing hand-rolled `SETTINGS_ENCRYPTION_KEY` guard is folded into the schema.
- **`prisma/seed.ts`** keeps its own small check for `ADMIN_EMAIL` / `ADMIN_PASSWORD` (needed only by the seed, not the running app), but adopts `load-env.ts` and the shared placeholder/complexity rules.
- **Docs:** `.env.example` and `SPEC.md` §10 note that the API/worker now refuse to start in strict mode without the required set; the deployment runbook (`infra/railway/README.md`) already lists that set.

Not in scope: changing which variables the app uses, secret rotation, a secrets manager, or moving `DATABASE_URL` validation away from Prisma (Prisma already fails hard on a missing/invalid `DATABASE_URL`).

## Capabilities

### New Capabilities

- `security/configuration`: How the API and worker load and validate runtime configuration — a single parsed-once source, strict fail-fast validation outside explicit development/test mode, rejection of weak secrets and localhost/placeholder values in production, and no ad hoc `process.env` reads for these settings.

### Modified Capabilities

<!-- none — no existing requirement changes; this adds startup-configuration behavior no current spec covers -->

## Impact

- **`apps/api`** — new `src/config.ts` and `src/load-env.ts`; ~10 files refactored to import `config` instead of reading `process.env` (`plugins/{session,cors,rateLimit}.ts`, `lib/{queues,mailer,storage,crypto}.ts`, `routes/auth.ts`, `index.ts`, `worker.ts`); `prisma/seed.ts` adopts `load-env.ts`. No new dependency (`zod` is already present).
- **Startup behavior** — in `NODE_ENV=production` (Railway) the API and worker now exit non-zero on incomplete/invalid config instead of booting; local `pnpm dev` requires `NODE_ENV=development` (already in `.env.example`) or it runs strict.
- **Tests** — `vitest` runs as `test`/`development`, so the suite still boots on the existing dev defaults; new tests cover: strict mode exits on a missing required var, strict mode rejects a placeholder secret and a malformed URL, dev mode boots with no extra config.
- **Docs** — `.env.example`, `SPEC.md` §10.
- **No API route contract, data model, or `apps/web` change.**
