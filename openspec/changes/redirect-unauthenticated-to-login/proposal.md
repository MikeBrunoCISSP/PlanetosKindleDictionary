## Why

The landing page (`/`) currently renders a "You are not signed in" message for unauthenticated visitors instead of sending them to the login page. Since all useful content in the app requires authentication, unauthenticated users should be redirected to `/login` immediately.

## What Changes

- Add a `beforeLoad` guard to the `/` route that checks session state and redirects unauthenticated users to `/login`.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `auth/login-registration`: Add the unauthenticated-home-redirect requirement — the flip-side of the existing "authenticated user visiting `/login` redirects to `/`" scenario.

## Impact

- `apps/web/src/routes/index.tsx` — add `beforeLoad` using `context.queryClient` (same pattern as `/admin` and `/series/new`).
