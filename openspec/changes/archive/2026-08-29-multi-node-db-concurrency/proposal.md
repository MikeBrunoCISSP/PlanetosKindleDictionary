## Why

The API is intended to run as multiple horizontal nodes against a shared PostgreSQL database. Three database operations use a read-then-write pattern (TOCTOU) that does not hold its correctness invariants under concurrent requests — including those arriving on separate nodes. Fixing these now avoids silent data corruption as soon as a second node is added.

## What Changes

- **`POST /api/auth/register`**: Add P2002 catch on `prisma.user.create` so a concurrent duplicate registration that slips past the pre-check still returns `409 Conflict` instead of an unhandled 500.
- **`PATCH /api/admin/users/:id`**: Wrap the active-admin count check and the update in a single serializable database transaction so concurrent requests cannot jointly leave zero active administrators.
- **`PATCH /api/series/:slug`**: Remove the redundant `findUnique` existence pre-check and catch P2025 directly from `update`, eliminating the window where a concurrent deletion causes an unhandled error.
- Add `isPrismaError(err, code)` helper to `apps/api/src/lib/errors.ts` for consistent Prisma error code checks.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `auth/login-registration`: Add a scenario asserting that concurrent duplicate registrations are correctly rejected with 409 rather than producing a 500.
- `admin/user-management`: Add a scenario asserting that the last-active-admin constraint holds atomically under concurrent requests.

## Impact

- `apps/api/src/routes/auth.ts` — registration handler
- `apps/api/src/routes/admin.ts` — user update handler
- `apps/api/src/routes/series.ts` — series update handler
- `apps/api/src/lib/errors.ts` — new `isPrismaError` helper
- `apps/api/tests/` — new concurrent-scenario tests
