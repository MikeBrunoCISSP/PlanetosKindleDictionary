## 1. Switch Component

- [x] 1.1 In `apps/web`, run `pnpm dlx shadcn@latest add switch` and verify `apps/web/src/components/ui/switch.tsx` exists

## 2. Theme Provider

- [x] 2.1 Create `apps/web/src/lib/useTheme.ts` with `ThemeContext`, `ThemeProvider` (reads `localStorage` key `planetos-theme` on mount, applies/removes `dark` class on `document.documentElement` in a `useEffect`, writes back on change), and `useTheme()` hook; verify `pnpm --filter web typecheck` passes

## 3. App Wiring

- [x] 3.1 In `apps/web/src/main.tsx`, import `ThemeProvider` and wrap `RouterProvider` with it (inside `QueryClientProvider`); verify `pnpm --filter web typecheck` passes
- [x] 3.2 In `apps/web/index.html`, add an inline `<script>` in `<head>` that reads `localStorage.getItem("planetos-theme")` and adds class `"dark"` to `document.documentElement` if the value is `"dark"`

## 4. Preferences Route

- [x] 4.1 Create `apps/web/src/routes/preferences.tsx` with a `beforeLoad` auth guard (redirect to `/login` if unauthenticated, same pattern as `/`), and a page component that renders a settings card containing a shadcn `Switch` wired to `useTheme()`; verify `pnpm --filter web typecheck` passes

## 5. AppHeader Settings Section

- [x] 5.1 In `apps/web/src/components/AppHeader.tsx`, extend `openSection` type to include `"settings"`, add a "Settings" section header `DropdownMenuItem` (with `closeOnClick={false}`) and a "Preferences" shelf `DropdownMenuItem` that navigates to `/preferences`; verify `pnpm --filter web typecheck` passes

## 6. Smoke Test

- [x] 6.1 Start the dev server, log in, open the hamburger menu, expand "Settings", click "Preferences", verify the `/preferences` page loads with a dark mode toggle; toggle it on, verify the app switches to dark mode; reload, verify dark mode persists; toggle off, verify light mode is restored
