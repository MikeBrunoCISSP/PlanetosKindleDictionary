## Context

The User model (see SPEC.md §4) currently has `role: Role @default(MEMBER)` (MEMBER | ADMIN) and `emailVerified`. There are no fields for account suspension. The existing auth routes trust that any user with a session is active. The admin dashboard route (`/admin`) is planned in SPEC.md §8 but not yet implemented.

## Goals / Non-Goals

**Goals:**
- Add `isActive` field to User via a non-destructive migration (all existing rows get `isActive = true` as the default).
- Enforce `isActive` at login and on every authenticated request through a shared guard.
- Seed an initial admin account from env vars without hard-coding credentials.
- Expose minimal admin API (list users, patch isActive/role) with a role guard and last-admin protection.
- Ship the `/admin` frontend as a single-page user table with row actions.

**Non-Goals:**
- Email verification enforcement (deferred per SPEC.md Milestone 2).
- Bulk user operations or CSV export.
- Self-service account deletion.
- Audit log for admin actions (the Revision model covers entries; admin actions are out of scope for v1 logging).

## Decisions

### D1 — Schema: `isActive` boolean vs. `AccountStatus` enum

**Choice:** `isActive Boolean @default(true)`.

**Rationale:** The only states currently needed are active and disabled. An enum (`ACTIVE | SUSPENDED | DELETED`) would add complexity without immediate benefit; Prisma migrations can extend this later with zero breakage if a third state (e.g., `PENDING_VERIFICATION`) is needed. A boolean is smaller, indexable, and maps directly to toggle UI.

**Alternative considered:** `status AccountStatus @default(ACTIVE)` — rejected because it requires more migration boilerplate and a new enum type in Postgres, for no present gain.

### D2 — Lockout prevention: last-admin guard vs. special-cased account flag

**Choice:** Reject any PATCH that would leave zero active admin accounts (`role = ADMIN` and `isActive = true` count drops to zero). No special flag on the User row.

**Rationale:** The real goal is preventing lockout, not protecting a specific account identity. A last-admin guard covers the case regardless of which account is the last one standing — including scenarios where the initial seeded admin has been supplemented by other admins and one of those is the last remaining one. It also avoids adding a field to the schema that has no meaning beyond a special-case guard, and avoids the fragility of tying protection to identity (email or a flag set at seed time).

**Recovery path:** If the system ever reaches zero active admins (e.g., a direct database edit), the seed script can be re-run to restore the initial admin account.

**Alternative considered:** `isBuiltin Boolean @default(false)` stored on the seed account — rejected because it protects a specific identity rather than the invariant (at least one active admin must exist), and requires an extra schema field and special-case branch in the PATCH handler for no additional benefit over the last-admin count check.

### D3 — Account-status enforcement: check DB on every request vs. encode in session

**Choice:** Check the database on every authenticated request (read `isActive` from the User row).

**Rationale:** Redis session data is stale by design — the session stores `userId` only, not the full user record. If we encoded `isActive` in the session, an admin disabling an account would not take effect until the session expires. The correct security model is: session proves identity; the database proves current authorization. The extra DB read is a single indexed primary-key lookup and is negligible compared to the Argon2 hash at login.

**Alternative considered:** Store `isActive` in the session and invalidate the session on PATCH — rejected because session invalidation in Redis requires scanning all sessions by userId, which is O(n) without a secondary index.

### D4 — Admin guard: Fastify `preHandler` vs. inline check in each route

**Choice:** A shared `requireAdmin` preHandler added to the admin route plugin's scope.

**Rationale:** Both `GET /api/admin/users` and `PATCH /api/admin/users/:id` need the same check: valid session + `role === ADMIN` + `isActive === true`. A single preHandler avoids repeating the check in each handler and makes it easy to audit. It reads the User row and attaches it to the request for handler use.

**Alternative considered:** Inline check in each handler — rejected because it duplicates logic and makes it easy to accidentally omit on a new admin route.

### D5 — Seed script: Prisma seed vs. migration SQL

**Choice:** `prisma/seed.ts` (`upsert` by email) run via `pnpm --filter api seed` (configured in `package.json` as `prisma db seed`).

**Rationale:** Migrations run once and are not re-runnable. A seed script is idempotent and can be re-run after password rotation or accidental lockout. The `upsert` ensures the admin account is created if missing and updated if credentials changed, without touching any other rows.

**Alternative considered:** An initial migration that inserts the admin with a hardcoded password — rejected because hardcoded credentials in version control are a security risk.

### D6 — Frontend: table library vs. plain shadcn Table

**Choice:** shadcn/ui `Table` primitives (`<Table>`, `<TableHeader>`, `<TableBody>`, `<TableRow>`, `<TableCell>`) with TanStack Query for data fetching and inline mutation calls.

**Rationale:** The user list is not expected to exceed a few hundred rows in practice. A full DataTable library (TanStack Table) adds dependency weight for a single admin page. Plain shadcn Table is sufficient; pagination can be added later if needed.

**Alternative considered:** TanStack Table — deferred; can be introduced when the admin page grows more columns or sort/filter requirements.

## Risks / Trade-offs

- **Session staleness window**: A disabled user can complete any in-flight request that reached the handler before the PATCH committed. This is a sub-second window and acceptable.
- **No session revocation on disable**: Existing sessions for a disabled user are not destroyed in Redis. They become inert (blocked at the DB check), but the session keys accumulate until TTL expires. A future change could add a Redis set per userId to track and purge sessions.
- **Seed password in env**: `ADMIN_PASSWORD` in `.env` is plaintext. Teams using secrets managers should inject it at runtime rather than committing `.env` — documented in `.env.example`.
- **Last-admin check race**: Two concurrent PATCHes that each pass the last-admin count check could theoretically both succeed, leaving zero admins. This is extremely unlikely in practice (admin operations are infrequent); a database-level constraint or advisory lock could prevent it if it becomes a concern.

## Migration Plan

1. Generate migration: `pnpm --filter api prisma migrate dev --name add-user-isactive` — adds `isActive BOOLEAN NOT NULL DEFAULT TRUE` to the `User` table. All existing rows default to active.
2. Deploy API with updated code (session guard + login check + admin routes).
3. Run seed: `pnpm --filter api seed` — creates the initial admin if absent.
4. Verify: log in as the initial admin, confirm `/admin` loads the user table.

**Rollback:** Drop the `isActive` column via a new migration. The login guard change is backwards-compatible — the column defaults to `true`, so no user is accidentally locked out during a partial rollout.
