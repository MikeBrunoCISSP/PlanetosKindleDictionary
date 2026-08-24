## 1. Monorepo Scaffold

- [x] 1.1 Create root `package.json` with `"workspaces"` pointing to `apps/*` and `packages/*`, add `pnpm-workspace.yaml`, and verify `pnpm install` resolves with no errors
- [x] 1.2 Create `tsconfig.base.json` at the repo root with shared TypeScript options (`target: ESNext`, `moduleResolution: NodeNext`, `strict: true`, `noUncheckedIndexedAccess: true`) and verify each workspace `tsconfig.json` extends it
- [x] 1.3 Create `infra/docker-compose.yml` with services for PostgreSQL 16, Redis 7, and MinIO; verify `docker compose up -d` starts all three healthy
- [x] 1.4 Create `.env.example` documenting all required env vars (`DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `S3_*`, `PUBLIC_BASE_URL`, `SMTP_URL`, `BUILD_CRON`) and verify a `.env` copied from it allows the API to start

## 2. Shared Package (`packages/shared`)

- [x] 2.1 Scaffold `packages/shared` with `package.json` (name `@planetos/shared`, ESM, `exports` field pointing to `dist/`) and a `tsconfig.json` extending the base; verify `pnpm --filter @planetos/shared build` succeeds with no type errors
- [x] 2.2 Create `packages/shared/src/auth.ts` with `passwordSchema` enforcing ≥8 chars, ≥1 uppercase, ≥1 lowercase, and ≥1 digit via `.superRefine` — each violation produces a distinct error message; verify unit tests (Vitest) cover all four failure scenarios and the success case
- [x] 2.3 Add `registerSchema` (`email`, `displayName`, `password` using `passwordSchema`) and `loginSchema` (`email`, `password`) to `auth.ts`; export inferred `RegisterDto`, `LoginDto`, and `UserDto` types; verify the build produces correct `.d.ts` files

## 3. API — Database Layer (`apps/api`)

- [x] 3.1 Scaffold `apps/api` with `package.json` (ESM, `"type": "module"`), `tsconfig.json` extending the base, and a `src/index.ts` entry point; verify `pnpm --filter api typecheck` passes on the empty scaffold
- [x] 3.2 Add Prisma to `apps/api`, create `prisma/schema.prisma` with the `User` model (`id`, `email @unique`, `displayName @unique`, `passwordHash`, `role`, `emailVerified`, `createdAt`, `revisions Revision[]`); run `pnpm --filter api prisma migrate dev --name init` and verify the `User` table exists in the database
- [x] 3.3 Generate the Prisma client and verify `import { PrismaClient } from '@prisma/client'` resolves without type errors in `apps/api`

## 4. API — Fastify Infrastructure

- [x] 4.1 Install and register `@fastify/cookie` and `@fastify/session` in the Fastify app; configure the session plugin with `ioredis` as the store, `SESSION_SECRET` for signing, `httpOnly: true`, and `sameSite: 'lax'`; verify that a test request receives a `Set-Cookie` header after login
- [x] 4.2 Install and configure `@fastify/rate-limit` using Redis as the store; expose two named preHandlers: `registrationRateLimit` (5/60min/IP) and `loginRateLimit` (10/15min/IP); verify a tight-loop test triggers `429` with a `Retry-After` header
- [x] 4.3 Add a global Fastify error handler that maps Zod validation errors to `400 application/problem+json` and known domain errors (`DUPLICATE_EMAIL`, `DUPLICATE_DISPLAY_NAME`, `INVALID_CREDENTIALS`) to their correct HTTP statuses and RFC 9457 bodies; verify the handler returns the correct shape for each error type

## 5. API — Auth Routes

- [x] 5.1 Implement `POST /api/auth/register`: validate body with `registerSchema` from `@planetos/shared`, check for duplicate email and displayName (return `409` on conflict), hash password with `@node-rs/argon2`, create the User record in a Prisma transaction, open a session, and return `201` with the `UserDto`; attach `registrationRateLimit` preHandler
- [x] 5.2 Implement `POST /api/auth/login`: validate body with `loginSchema`, look up the user by email, verify the password with `@node-rs/argon2` (`verify`), return a generic `401` for any failure (wrong email or wrong password — no enumeration), open a session on success, and return `200` with the `UserDto`; attach `loginRateLimit` preHandler
- [x] 5.3 Implement `POST /api/auth/logout`: destroy the session and return `204 No Content`; verify a subsequent `GET /api/auth/me` returns `401`
- [x] 5.4 Implement `GET /api/auth/me`: return `200` with the `UserDto` if a valid session exists; return `401` otherwise; verify with an integration test that checks both the authenticated and unauthenticated cases

## 6. Web App Scaffold (`apps/web`)

- [x] 6.1 Scaffold `apps/web` with a Vite + React 19 + TypeScript template; install `@tanstack/react-router` and `@tanstack/router-vite-plugin`; create `src/main.tsx`, `src/router.tsx`, and `src/routes/__root.tsx` with a minimal root layout; verify `pnpm --filter web dev` starts without errors
- [x] 6.2 Install and configure Tailwind CSS v4 and initialise shadcn/ui (`npx shadcn init`); add components `Card`, `Input`, `Button`, `Form`, `Tabs`, and `Label` via `shadcn add`; verify the components render in the root layout without style errors
- [x] 6.3 Configure a Vite proxy so requests to `/api` are forwarded to `http://localhost:3000`; verify `GET /api/auth/me` resolves correctly from the browser without CORS errors

## 7. Frontend — Auth State

- [x] 7.1 Create `src/lib/api.ts` with typed fetch helpers for `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/me` that parse `application/problem+json` error bodies and throw typed errors; verify the helpers resolve and reject correctly in unit tests
- [x] 7.2 Create a `useMe` TanStack Query hook that fetches `GET /api/auth/me`; cache it globally so all routes share the same auth state; verify the hook returns `undefined` when unauthenticated and the `UserDto` when authenticated

## 8. Frontend — Login/Registration Page

- [x] 8.1 Create `src/routes/login.tsx` as a TanStack Router file-based route for `/login`; add a redirect-if-authenticated guard at the top of the component using `useMe` and `useNavigate` that sends already-logged-in users to `/`; verify that visiting `/login` while authenticated in the browser redirects immediately
- [x] 8.2 Implement the `<Tabs>` layout with **Sign In** and **Register** tabs driven by the `?mode=` search param; switching tabs updates the URL and preserves browser history; verify both tabs are reachable via URL and the correct form is visible
- [x] 8.3 Build the **Sign In** form: `email` and `password` fields managed by `react-hook-form` with `zodResolver(loginSchema)`; on submit call the login API helper; on success navigate to `/`; on `401` display a generic "Invalid email or password" message in the form root; verify the form shows the error without reloading the page
- [x] 8.4 Build the **Register** form: `email`, `displayName`, `password`, and `confirmPassword` fields managed by `react-hook-form` with a local schema that extends `registerSchema` and adds a `.superRefine` confirm-password check; on submit call the register API helper; on success navigate to `/`; on `409` surface the specific conflict (email or display name taken) inline; verify confirm-password mismatch shows an error before the request is sent
- [x] 8.5 Add an index route (`src/routes/index.tsx`) at `/` that shows a greeting and a **Log out** button wired to `POST /api/auth/logout` followed by a redirect to `/login`; this route is the post-login landing page for smoke testing

## 9. Integration Verification

- [x] 9.1 Run `pnpm typecheck` across all workspaces and fix any type errors; verify the command exits `0`
- [x] 9.2 Run `pnpm --filter api test` to execute API integration tests (register, login, logout, /me, rate limits, duplicate rejection, password rule rejection) against a real Postgres and Redis instance; verify all tests pass
- [x] 9.3 Perform an end-to-end smoke test in the browser: navigate to `http://localhost:5173/login`, register a new account with a valid email/displayName/password, confirm redirect to `/`, click **Log out**, confirm redirect back to `/login`, log in with the same credentials, confirm redirect to `/`
