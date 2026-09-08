## 1. Text change

- [x] 1.1 In `apps/web/src/components/AppHeader.tsx`, change the unauthenticated header link's text from `Log In` to `Log In/Register`. Verify `pnpm --filter @planetos/web exec tsc --noEmit` passes.

## 2. Verification

- [x] 2.1 Start the web dev server, view any page while logged out, and confirm the header shows "Log In/Register" and that clicking it still navigates to `/login` with both the Sign In and Register tabs available as before.
- [x] 2.2 `openspec validate rename-header-login-link --type change --strict` passes.
