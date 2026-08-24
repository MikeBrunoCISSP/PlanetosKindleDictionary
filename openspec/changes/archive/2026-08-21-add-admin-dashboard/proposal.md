## Why

The application currently has no way to create an administrator account at deploy time, and no way for an administrator to manage user accounts. Without a built-in admin and a management dashboard, there is no operational path to disable rogue users, promote trusted contributors, or demote admins whose access should be revoked.

## What Changes

- Add `isActive Boolean @default(true)` to the `User` model and generate a migration.
- Add a Prisma seed script (`apps/api/prisma/seed.ts`) that upserts the initial admin account from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars on each `pnpm --filter api seed` invocation. The password must satisfy the existing complexity rules.
- Update `POST /api/auth/login` to return `403 Forbidden` when the account is disabled (`isActive === false`), with a distinct RFC 9457 problem body.
- Update all authenticated route guards and `GET /api/auth/me` to check `isActive` on every request; a disabled user whose session is still active receives `403 Forbidden` (session is not destroyed, but the account is blocked).
- Add `GET /api/admin/users` — paginated list of all users (admin-only).
- Add `PATCH /api/admin/users/:id` — update `isActive` or `role` on a user (admin-only). Any change that would leave zero active ADMIN accounts returns `409 Conflict`.
- Add `/admin` frontend route — user management table (display name, email, role, status) with per-row toggle buttons for enable/disable, promote to ADMIN, and demote to MEMBER. Action buttons that would leave zero active admins are disabled in the UI. Non-admin visits redirect to `/`.
- Document `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env.example`.

**Assumptions recorded:**
- Any account with `role === ADMIN` and `isActive === true` can access the admin dashboard (not only the seeded admin after first deploy; that is just the initial state).
- Disabling an account does not destroy existing sessions; the block is enforced on the next API call by checking `isActive` from the database.
- The system prevents any PATCH that would result in zero active admin accounts (last-admin protection), regardless of which account is targeted.

## Capabilities

### New Capabilities

- `admin/user-management`: Admin dashboard API and frontend for listing users and changing their `isActive` status and `role`.

### Modified Capabilities

- `auth/login-registration`: Login and session validation must now enforce `isActive`; a disabled account returns `403` at login and on subsequent authenticated requests.

## Impact

- **Database**: New `isActive` column on `User`; new Prisma migration and seed script.
- **API** (`apps/api`): New `PATCH /api/admin/users/:id` and `GET /api/admin/users` endpoints; updated login and session guard logic.
- **Frontend** (`apps/web`): New `/admin` route and user management table component.
- **Shared** (`packages/shared`): New `adminUserSchema` / `AdminUserDto`, `updateUserSchema` DTOs exported from `packages/shared`.
- **Env vars**: `ADMIN_EMAIL`, `ADMIN_PASSWORD` added to `.env.example`.
- **No breaking changes** to existing public API contracts.
