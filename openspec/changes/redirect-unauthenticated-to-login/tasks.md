## 1. Route Guard

- [x] 1.1 Add a `beforeLoad` to `apps/web/src/routes/index.tsx` that calls `context.queryClient.fetchQuery` for `["auth", "me"]` (same pattern as `/admin`) and throws `redirect({ to: "/login" })` if the result is `null`; verify `pnpm --filter web typecheck` passes

## 2. Verification

- [x] 2.1 Start the dev server (`pnpm dev`), open `http://localhost:5173` without a session, and confirm the browser lands on `/login`; then log in and confirm navigating to `/` renders the home page normally
