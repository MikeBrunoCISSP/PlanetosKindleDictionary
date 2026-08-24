## Context

This is the first code on the new stack. Nothing exists yet — the repo holds only SPEC.md and the openspec directory. Every structural decision made here sets the pattern for all subsequent changes.

See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Establish the pnpm monorepo layout defined in SPEC.md §3 (apps/api, apps/web, packages/shared, infra/)
- Ship working registration and login backed by real Postgres + Redis
- Enforce password rules in one shared Zod schema consumed by both layers
- Keep the session implementation dead simple and stateful (no JWTs)

**Non-Goals:**
- Email verification (deferred to a follow-up change; `emailVerified` is stored but not checked)
- Password reset flow
- OAuth / social login
- Admin screens or role-based route guards beyond redirecting unauthenticated users away from `/login`

## Decisions

### Monorepo layout: pnpm workspaces

SPEC.md mandates pnpm workspaces. All three workspace packages (`apps/api`, `apps/web`, `packages/shared`) are TypeScript-first with ESM output.

- `apps/api`: `"type": "module"`, `tsconfig.json` targets `ESNext`/`NodeNext` for Node 22 native ESM. Source files under `src/`, compiled to `dist/` via `tsc`.
- `apps/web`: Vite handles transpilation; TypeScript is compile-time only. No `dist/` in source control.
- `packages/shared`: compiled to `dist/` and exported via `exports` field so both api and web can import from `@planetos/shared`.

### Shared Zod schema strategy

`packages/shared/src/auth.ts` exports:
- `passwordSchema` — `.min(8).regex(...)` with `.superRefine` for each rule so individual error messages name the violated requirement
- `registerSchema` — `{ email: z.string().email(), displayName: z.string().min(1).max(50), password: passwordSchema }`
- `loginSchema` — `{ email: z.string().email(), password: z.string().min(1) }`
- Inferred TypeScript types (`RegisterDto`, `LoginDto`, `UserDto`)

The frontend uses the same `registerSchema` and adds a local `confirmPassword` field via `.superRefine` in the form — this stays frontend-only because the API has no need for it.

**Why shared schema over duplicated validation?** A single source of truth prevents the API and the UI from silently drifting apart on what constitutes a valid password.

### Password hashing: Argon2id via `@node-rs/argon2`

SPEC.md mandates Argon2id. `@node-rs/argon2` is a native Rust binding for Node — faster and more correct than a pure-JS implementation. Default parameters (memory 65536, iterations 3, parallelism 4) are used; they can be tuned later via env vars without changing the schema.

**Alternative considered**: `bcrypt` — rejected, Argon2id is the modern standard and SPEC.md explicitly calls it out.

### Session: `@fastify/session` + `ioredis` store

Sessions are stored in Redis under a random signed session ID. The cookie is HTTP-only and `SameSite=Lax`. `SESSION_SECRET` env var (≥32 bytes) signs the cookie.

**Alternative considered**: JWT — rejected. JWTs require a logout blacklist to support logout, adding complexity without benefit given this is a server-rendered-adjacent SPA with a same-origin API.

### Rate limiting: `@fastify/rate-limit`

Two independent rate-limit decorators:
- `/api/auth/register`: 5 requests / 60 min / IP
- `/api/auth/login`: 10 requests / 15 min / IP

Redis is the backing store (same Redis instance used for sessions) so limits survive API restarts.

### Frontend routing: TanStack Router (file-based)

SPEC.md mandates TanStack Router. The router tree is bootstrapped with the Vite plugin (`@tanstack/router-vite-plugin`). Route files live under `src/routes/`. The `/login` route is `src/routes/login.tsx`.

### Login/Registration UI: single page with shadcn/ui Tabs

A single `/login` route renders a `<Tabs>` component (shadcn/ui) with two tabs: **Sign In** and **Register**. Active tab is derived from `?mode=login|register` in the URL so deep-linking and back-navigation work correctly.

Each tab renders a `<form>` managed by `react-hook-form` with a `zodResolver`. Field errors render inline below their inputs using shadcn/ui `<FormMessage>`. Server errors (e.g. "email already in use") are surfaced via the form's root error.

**Alternative considered**: two separate `/login` and `/register` pages as in SPEC.md §8 — rejected in favour of the user's explicit request for a single page. `/register` will redirect to `/login?mode=register` if ever linked to directly.

### API error format: RFC 9457 problem+json

All error responses from `apps/api` use `Content-Type: application/problem+json` with `{ type, title, status, detail }`. Fastify's `setErrorHandler` maps Zod validation errors and known domain errors to this shape.

## Risks / Trade-offs

- **Native module cold-start**: `@node-rs/argon2` ships pre-built binaries — if a binary is missing for the target platform, the install fails. Mitigation: CI must run on the same OS as production; document in the README.
- **Single Redis instance for sessions + rate limits**: if Redis goes down, login is unavailable. Mitigation: in production use a managed Redis (Upstash / ElastiCache); in dev this is acceptable.
- **No email verification gate**: a user can register with a fake email and start editing entries. Mitigation: the `emailVerified` field is stored and the follow-up auth change will add the gate; the data model is ready.

## Migration Plan

1. Run `docker compose -f infra/docker-compose.yml up -d` to start Postgres, Redis, MinIO.
2. Run `pnpm --filter api prisma migrate dev --name init` to apply the initial User migration.
3. Run `pnpm dev` to start the API (`:3000`) and web (`:5173`).
4. No data migration needed — this is the initial schema.

Rollback: `docker compose down -v` removes all data; there is nothing to preserve on a fresh install.

## Open Questions

- Should `/login` redirect to a `?next=` URL after successful auth (so a protected page can send the user to login and return them after)? Deferred — no protected pages exist yet; add `?next=` support when the first auth-gated route is built.
