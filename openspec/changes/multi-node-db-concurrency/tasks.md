## 1. Shared Helper

- [x] 1.1 Add `isPrismaError(err: unknown, code: string): boolean` helper to `apps/api/src/lib/errors.ts`; verify `pnpm --filter api typecheck` passes

## 2. Registration Race Fix

- [x] 2.1 In `apps/api/src/routes/auth.ts`, wrap `prisma.user.create` in a try/catch that catches P2002 (via `isPrismaError`) and maps `meta.target` to `Errors.DUPLICATE_EMAIL()` or `Errors.DUPLICATE_DISPLAY_NAME()`; verify `pnpm --filter api typecheck` passes and existing registration tests still pass

## 3. Last-Admin Transaction Fix

- [x] 3.1 In `apps/api/src/routes/admin.ts`, move the entire `PATCH /api/admin/users/:id` body (target lookup, last-admin count check, and update) into `prisma.$transaction(async (tx) => { ... }, { isolationLevel: 'Serializable' })`; verify `pnpm --filter api typecheck` passes and all admin PATCH tests still pass

## 4. Series PATCH Simplification

- [x] 4.1 In `apps/api/src/routes/series.ts`, remove the `findUnique` existence pre-check from `PATCH /api/series/:slug`, call `prisma.series.update` directly, and catch P2025 (via `isPrismaError`) to throw `Errors.NOT_FOUND()`; verify `pnpm --filter api typecheck` passes and the existing `PATCH unknown slug 404` test still passes

## 5. Verification

- [x] 5.1 Run `pnpm --filter api test` and confirm all existing tests pass with no regressions
