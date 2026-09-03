## Context

See proposal.md — Why. Design-relevant current state:

- **Three entrypoints** each load `.env` themselves as the first statement of their module body: `apps/api/src/index.ts`, `apps/api/src/worker.ts`, `apps/api/prisma/seed.ts` — all with `dotenv.config({ path: <repo-root>/.env })`.
- **ESM import-ordering trap**: in `index.ts` the `dotenv.config()` call sits *after* the static `import` list, so every imported module is evaluated before `.env` is loaded. `lib/{queues,mailer,storage}.ts` work around this by deferring their `process.env` reads to first use (lazy `??=`); their file comments say so explicitly. `lib/crypto.ts` reads `SETTINGS_ENCRYPTION_KEY` inside `getKey()` (also lazy) and already throws when it is missing or `< 32` chars — the one existing "fail loud" precedent.
- **Consumers** (all reading `process.env` directly today): `plugins/session.ts` (`REDIS_URL`, `SESSION_SECRET`, `NODE_ENV`), `plugins/cors.ts` (`PUBLIC_BASE_URL`), `plugins/rateLimit.ts` (`REDIS_URL`), `lib/queues.ts` (`REDIS_URL`), `lib/mailer.ts` (`SMTP_URL`), `lib/storage.ts` (`S3_BUCKET|ENDPOINT|REGION|ACCESS_KEY_ID|SECRET_ACCESS_KEY`), `lib/crypto.ts` (`SETTINGS_ENCRYPTION_KEY`), `routes/auth.ts` ×3 (`PUBLIC_BASE_URL` for email links), `index.ts` (`PORT`), `worker.ts` (`BUILD_CRON`), `prisma/seed.ts` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`).
- `zod` is a direct dependency of `apps/api`. `vitest` has no `env` override; `tests/setup.ts` loads the repo `.env` (which now carries `NODE_ENV=development`), and vitest itself defaults `NODE_ENV` to `test` when unset — either way the suite is non-strict.
- `apps/api` compiles with `tsc --project tsconfig.build.json` (`rootDir: src`), so anything under `src/` is emitted; `prisma/` is not.

## Goals / Non-Goals

**Goals:**

- One place that knows the config contract; everything else consumes a typed value.
- A process that is misconfigured for production **cannot start** — the failure is at boot, aggregated, and legible.
- Zero friction for `NODE_ENV=development` / `test`; the test suite keeps booting on today's defaults.
- Delete the lazy `process.env` workarounds now that ordering is handled centrally.

**Non-Goals:**

- Reworking which variables exist, secret rotation, or a secrets manager.
- Taking `DATABASE_URL` validation away from Prisma (it already hard-fails; `config` may surface it for typing but Prisma stays the enforcer).
- A Fastify-decorator / dependency-injection framework — the delivery mechanism is a single imported module (per the chosen approach).
- Validating `apps/web` (build-time, no secrets) or `packages/*`.

## Decisions

### 1. `load-env.ts` — a side-effect module imported first

New `apps/api/src/load-env.ts` contains only the `dotenv.config({ path: … })` call (the same repo-root path logic the three entrypoints use today). `config.ts` imports it at the top; each entrypoint imports `./load-env.js` as its **first** import. Because ESM evaluates imports depth-first before the importing module's body, this guarantees `.env` is applied before any `process.env` read anywhere in the graph — which is exactly what the lazy `??=` blocks were compensating for. Those become plain eager reads of `config`.

- *Alternative — keep `dotenv.config()` in each entrypoint body and make `config` a `loadConfig()` function called explicitly after it*: more ceremony, every consumer needs a `getConfig()` that throws-if-unloaded, and it doesn't fix the ordering for any *other* future top-level env read. Rejected.

### 2. `config.ts` — one zod schema, strict unless dev/test, parsed once

`apps/api/src/config.ts`:

```
import "./load-env.js";
import { z } from "zod";

const mode = process.env.NODE_ENV;
const strict = mode !== "development" && mode !== "test";
```

Build the schema so **required-in-strict** fields are `.optional()` with a `.default(<local value>)` applied only when `!strict`, and `.min`/`.url`/placeholder `.refine` checks apply only when `strict`. Parse `process.env` once with `safeParse`; on failure, format `error.issues` into a multi-line list (`VAR — reason`) and:

- in an **entrypoint** context → `console.error(list); process.exit(1)`
- the module itself never calls `process.exit` at import time from a non-entrypoint; instead `config.ts` exports both the frozen `config` (throwing a plain `Error` if parse failed) and a `assertConfigValidOrExit()` the entrypoints call. Simplest that keeps `process.exit` out of the test/import path: `config.ts` throws on invalid; `index.ts` / `worker.ts` wrap the first access in `try { … } catch { console.error(e.message); process.exit(1) }`. Tests never hit strict mode so they never throw.

Exported shape (frozen): `{ nodeEnv, isProduction, port, databaseUrl, redisUrl, sessionSecret, settingsEncryptionKey, publicBaseUrl, smtpUrl, s3: { endpoint?, bucket, region, accessKeyId, secretAccessKey }, buildCron }`.

Validation rules (strict only): `sessionSecret` / `settingsEncryptionKey` `min(32)` + `refine(v => !PLACEHOLDERS.has(v))` where `PLACEHOLDERS` = the old committed fallback + the two `.env.example` `change-me-…` strings; `publicBaseUrl` `.url()` + `refine` host ∉ {`localhost`,`127.0.0.1`,`[::1]`}; `smtpUrl` `.url()` scheme `smtp`/`smtps`; `redisUrl` `.url()` scheme `redis`/`rediss`; `s3.bucket|accessKeyId|secretAccessKey` `min(1)`; `port` `coerce.number().int().positive()` default 3000; `buildCron` default `0 * * * *`.

- One schema/parser, but validation is **scoped per entry point** — `assertConfigValid("api" | "worker")`. The worker only consumes `REDIS_URL`, `S3_*` and Prisma's `DATABASE_URL` (queues + storage), so requiring it to also carry `SESSION_SECRET` / `PUBLIC_BASE_URL` / `SMTP_URL` would be wrong: `.railway/railway.ts` deliberately does not set those on the private worker service, so a whole-set check would block the worker from starting on Railway. Requirement 1's "the complete set of configuration values **it requires**" already anticipates this. The `Config` shape is still one type; the worker simply doesn't read the api-only fields.
- *Alternative — two full schemas*: more to keep in sync for a five-vs-nine-variable difference. Rejected in favour of one schema + a `WORKER_REQUIRED` allow-list.

### 3. `crypto.ts` guard folded in; `seed.ts` stays separate

`lib/crypto.ts` drops its own `SETTINGS_ENCRYPTION_KEY` check and reads `config.settingsEncryptionKey` (already guaranteed ≥ 32 in strict mode; in dev it's whatever `.env` has, same as today). `prisma/seed.ts` is a standalone script needing `ADMIN_EMAIL`/`ADMIN_PASSWORD` that the running app never uses — it adopts `./load-env.js` and the shared `PLACEHOLDERS` set + `passwordSchema`, but keeps its own small "these two must be set" check rather than bloating `config` with seed-only fields.

### 4. Consumer refactor is mechanical

Each listed file swaps `process.env["X"] ?? "<default>"` for `config.<x>`. `plugins/session.ts` `secure` becomes `config.isProduction`. `lib/{queues,mailer,storage}.ts` keep their lazy-init *structure* (connection/client caching) but the `process.env` read inside becomes a `config` read — and the "runs before dotenv" comments are deleted.

### 5. Entrypoint wiring

`index.ts` / `worker.ts`: first import is `./load-env.js`, then `./config.js`; the first statement of the module body is `try { assertConfigValid("api" | "worker") } catch (e) { console.error(e.message); process.exit(1) }`, so a bad config aborts before `new PrismaClient()` / `Fastify()` / `new Worker()`. `config.ts` never calls `process.exit` itself (safe to import from tests); `assertConfigValid` re-runs `validateEnv(process.env, scope)` — cheap — and throws the aggregated message.

## Risks / Trade-offs

- [Risk] A developer who never set `NODE_ENV` now gets strict mode and a failed boot. → `.env.example` already ships `NODE_ENV=development`; the error message says exactly that; call it out in `SPEC.md` §10 and the change's task for `.env.example`.
- [Risk] `vitest` not setting `NODE_ENV` on some CI runner → suite would run strict and fail. → `tests/setup.ts` will `process.env.NODE_ENV ??= "test"` as a belt-and-suspenders line; verified against the real runner in tasks.
- [Risk] Import-order regression later (someone adds a top-level `process.env` read before `load-env`). → `config` is the sanctioned path; the lazy comments are replaced with a short note pointing at `load-env.ts`. A lint rule for `process.env` in `apps/api/src` (allowing only `config.ts` / `load-env.ts`) is a reasonable follow-up, noted not required.
- [Trade-off] `config.ts` throwing (vs `process.exit`) means a stray unguarded `import` of `config` in a non-entrypoint could surface a stack trace instead of a clean message. Mitigated by the entrypoints doing the guarded first-access; acceptable.
- [Risk] `PUBLIC_BASE_URL` localhost rejection could bite a self-hosted deploy behind a tunnel using a `.localhost` domain. → Only `localhost` / loopback *hosts* are rejected, not domains containing the substring; documented.

## Migration Plan

Additive and backward-compatible for `development`/`test`. Rollout:

1. Land `load-env.ts`, `config.ts`, the consumer refactor, tests, and doc updates together.
2. Local devs: ensure `.env` has `NODE_ENV=development` (already in `.env.example`); otherwise `pnpm dev` prints the aggregated error and exits — copy the line and re-run.
3. Railway: `NODE_ENV=production` is already set by `.railway/railway.ts`; the required variables are already the operator checklist in `infra/railway/README.md`. First deploy after this change will hard-fail if any are missing — which is the point.

Rollback: revert the change; the previous ad hoc reads + fallbacks return. No data or schema involvement.

## Open Questions

- Whether to add the `no-restricted-syntax` lint rule banning `process.env` outside `config.ts` / `load-env.ts` now or as a follow-up — does not affect the spec or the task breakdown; default to a follow-up.
