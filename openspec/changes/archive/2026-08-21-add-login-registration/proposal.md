## Why

The project's new Node.js/TypeScript stack has no running code yet. A working `/login` page — backed by real registration and authentication endpoints — is the prerequisite for every authenticated feature (entry creation, series management, admin actions). Without it nothing that requires a user identity can be built or tested.

## What Changes

- New `/login` React route: a single page with a tab toggle between **Sign In** and **Register** modes
- New `POST /api/auth/register` endpoint: creates a User record with Argon2id-hashed password and opens a session
- New `POST /api/auth/login` endpoint: validates credentials and opens a signed-cookie Redis session
- New `POST /api/auth/logout` endpoint: destroys the session
- New `GET /api/auth/me` endpoint: returns the current authenticated user or 401
- Shared Zod schemas in `packages/shared/src/auth.ts` that enforce password rules and are used by both the API and the frontend
- Prisma `User` model and initial migration
- pnpm monorepo scaffold (`apps/api`, `apps/web`, `packages/shared`, `infra/docker-compose.yml`) required to run anything

## Capabilities

### New Capabilities

- `auth/login-registration`: User registration (email + displayName + password) and session-based login on a combined `/login` page; password complexity enforced in shared schema; confirm-password check on the frontend; rate limits on both endpoints

### Modified Capabilities

_(none — first change on this codebase)_

## Impact

- **New packages/apps**: `apps/api` (Fastify + Prisma), `apps/web` (React + TanStack Router), `packages/shared` (Zod schemas)
- **Database**: introduces the `User` table via Prisma migration
- **Infrastructure**: requires PostgreSQL 16, Redis 7 (sessions), and MinIO (object storage, for later builds) — all provided by `infra/docker-compose.yml`
- **Dependencies added**: `@node-rs/argon2`, `@fastify/cookie`, `@fastify/session`, `@fastify/rate-limit`, `ioredis`, `@prisma/client`, `react-hook-form`, `@hookform/resolvers`, `zod`, `@tanstack/react-router`, `@tanstack/react-query`, `shadcn/ui` component set
