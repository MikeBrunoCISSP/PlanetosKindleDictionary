## 1. Database Schema

- [x] 1.1 Add `isActive Boolean @default(true)` to the `User` model in `apps/api/prisma/schema.prisma`; verify `pnpm --filter api prisma validate` passes with no errors
- [x] 1.2 Run `pnpm --filter api prisma migrate dev --name add-user-isactive` and verify the migration file is created and the `User` table gains the `isActive` column with a default of `true`

## 2. Initial Administrator Seed

- [x] 2.1 Add `ADMIN_EMAIL` and `ADMIN_PASSWORD` entries (with placeholder values) to `.env.example` and `.env`; verify both files contain the new keys
- [x] 2.2 Create `apps/api/prisma/seed.ts` that reads `ADMIN_EMAIL`/`ADMIN_PASSWORD` from env, validates the password against `passwordSchema` from `@planetos/shared` (exits non-zero on failure), then upserts the admin account with `role: "ADMIN"` and `isActive: true`; verify the file compiles with `pnpm --filter api typecheck`
- [x] 2.3 Add `"prisma": { "seed": "tsx prisma/seed.ts" }` to `apps/api/package.json` and verify `pnpm --filter api seed` runs without error and creates the admin row in the database
- [x] 2.4 Run `pnpm --filter api seed` a second time and verify no duplicate row is created (idempotency check)

## 3. Shared DTOs

- [x] 3.1 Add `adminUserSchema` (id, email, displayName, role, isActive, createdAt) and `updateUserSchema` (partial object accepting `isActive: boolean` and/or `role: "MEMBER" | "ADMIN"`) to `packages/shared/src/auth.ts`; export inferred `AdminUserDto` and `UpdateUserDto` types; verify `pnpm --filter @planetos/shared build` succeeds with correct `.d.ts` output

## 4. API — Auth Enforcement Updates

- [x] 4.1 Add `ACCOUNT_DISABLED` to `apps/api/src/lib/errors.ts` returning a `DomainError` with status `403` and a distinct `type` URI (`urn:planetos:error:account-disabled`); verify the existing error handler maps it to `403` with an RFC 9457 body
- [x] 4.2 Update `POST /api/auth/login` in `apps/api/src/routes/auth.ts` to select `isActive` on the user lookup and throw `Errors.ACCOUNT_DISABLED()` if `isActive === false` (after the user is found but before password verification, to avoid timing differences); verify an integration test with a disabled user returns `403` and does not set a session cookie
- [x] 4.3 Update `GET /api/auth/me` to include `isActive` in the database `select` and return `403` with an RFC 9457 body if the user is disabled; verify an integration test where a user is disabled after login receives `403` on a subsequent `/me` call

## 5. API — Admin Routes

- [x] 5.1 Create `apps/api/src/plugins/requireAdmin.ts` as a Fastify `preHandler` that: (a) checks `request.session.userId` is set (else 401), (b) loads the user from the database including `isActive` and `role`, (c) checks `role === "ADMIN"` and `isActive === true` (else 403), and (d) attaches the user to `request` for handler use; verify with integration tests that a MEMBER session receives `403` and an unauthenticated request receives `401`
- [x] 5.2 Implement `GET /api/admin/users` in a new route file `apps/api/src/routes/admin.ts` behind `requireAdmin`; support `?page=` and `?limit=` query params (default limit 50, max 200); return an array of `AdminUserDto` ordered by `createdAt` ascending; verify an integration test confirms an admin receives `200` with the correct shape and a MEMBER receives `403`
- [x] 5.3 Implement `PATCH /api/admin/users/:id` in the same file behind `requireAdmin`; validate body with `updateUserSchema`; reject with `404` if the user does not exist; before applying the change, count active admins and reject with `409 Conflict` (error type `urn:planetos:error:last-admin`) if the update would reduce that count to zero; otherwise apply the update and return `200` with the updated `AdminUserDto`; verify integration tests cover: disable non-last admin (200), demote non-last admin (200), promote to admin (200), enable disabled user (200), disable-last-admin blocked (409), demote-last-admin blocked (409), not-found (404), non-admin rejected (403)
- [x] 5.4 Register the admin route plugin in `apps/api/src/index.ts` alongside the existing auth routes; verify `GET /api/admin/users` responds correctly to a request from a valid admin session

## 6. Frontend — Admin Dashboard

- [x] 6.1 Add `apiAdminGetUsers(page?: number): Promise<AdminUserDto[]>` and `apiAdminUpdateUser(id: string, patch: UpdateUserDto): Promise<AdminUserDto>` fetch helpers to `apps/web/src/lib/api.ts` using the same `handleResponse` pattern as existing helpers; verify correct TypeScript types compile without errors
- [x] 6.2 Create `src/routes/admin.tsx` as a TanStack Router file-based route for `/admin`; add an auth guard that redirects unauthenticated visitors to `/login` and renders a `403 Forbidden` message for authenticated non-admins; verify both guards fire correctly in the browser
- [x] 6.3 Build the user management table using shadcn/ui `Table` primitives; fetch users via a TanStack Query query keyed on `["admin","users"]`; display columns: display name, email, role, active status; verify the table renders the list of users when logged in as admin
- [x] 6.4 Add per-row action buttons: **Disable / Enable** (toggles `isActive`) and **Promote / Demote** (toggles `role`); each button calls `apiAdminUpdateUser` and invalidates `["admin","users"]` on success; on API error, display the problem `title` in a toast or inline error; verify clicking Disable on a non-last-admin user results in the row reflecting `isActive: false` after the mutation
- [x] 6.5 Compute client-side whether there is exactly one active admin in the fetched list; render the disable and demote buttons for that row as `disabled` (not clickable) so the UI prevents the user from attempting an action the API would reject with `409`; verify in the browser that those controls cannot be activated when only one active admin exists

## 7. Integration Verification

- [x] 7.1 Run `pnpm typecheck` across all workspaces and fix any type errors; verify the command exits `0`
- [x] 7.2 Run `pnpm --filter api test` and verify all existing tests still pass plus the new admin and auth-enforcement tests added in tasks 4.2, 4.3, 5.1, 5.2, and 5.3
- [x] 7.3 End-to-end smoke test: (a) log in as the initial admin, navigate to `/admin`, verify the user table loads; (b) register a new MEMBER account; (c) as admin, disable the new account and verify the row updates; (d) attempt to log in as the disabled account and confirm the `403` error is surfaced in the UI; (e) as admin, re-enable the account; (f) confirm the previously-disabled account can now log in successfully
