## Context

See proposal.md for motivation. The dark mode CSS infrastructure is already complete: `apps/web/src/index.css` defines both `:root` (light) and `.dark` (dark) CSS variable blocks, and the Tailwind `dark:` variant is wired via `@custom-variant dark (&:is(.dark *))`. Enabling dark mode requires only the `dark` class on `<html>`.

The existing AppHeader uses a local `openSection: "create" | "update" | null` state for accordion expansion. The Vite plugin (`@tanstack/router-plugin`) auto-regenerates the route tree when new route files are added.

## Goals / Non-Goals

**Goals:**
- Wire up the existing dark mode CSS by toggling the `dark` class on `<html>` from React state.
- Persist the selection in `localStorage` (key: `planetos-theme`, values: `"light"` | `"dark"`).
- Prevent FOUC by applying the class synchronously before React hydrates.
- Add the Settings accordion section and Preferences route.

**Non-Goals:**
- Backend/database storage of the preference — no cross-device sync needed in this change.
- OS `prefers-color-scheme` media query — default is light; the user sets their preference explicitly.
- Theming beyond light/dark (no custom color palettes).

## Decisions

**Decision: React context (`ThemeProvider` + `useTheme`) in `apps/web/src/lib/useTheme.ts`**

A context makes the current theme and `setTheme` available anywhere in the tree without prop drilling. The preferences page and any future component that needs the theme value both call `useTheme()`.

The provider:
1. Reads `localStorage.getItem("planetos-theme")` on mount.
2. Keeps `theme: "light" | "dark"` in state.
3. Applies/removes the `dark` class on `document.documentElement` in a `useEffect` whenever `theme` changes.
4. Writes back to `localStorage` in the same effect.

*Alternative considered: a plain custom hook that each consumer calls independently.*  
Rejected — multiple hook instances don't share React state, so toggling from the preferences page wouldn't update any other consumers that read the theme.

**Decision: `localStorage` for persistence**

This is a client-only SPA (Vite, no SSR). `localStorage` is synchronous, available immediately, and requires no API or DB changes. Cross-device sync is not a stated requirement.

*Alternative considered: store preference on the user's DB record.*  
Rejected for this change — adds a migration, an API endpoint, and a round-trip before the theme can be applied, with no user-visible benefit given the single-device assumption.

**Decision: Inline `<script>` in `index.html` for FOUC prevention**

React mounts asynchronously. Without an early class application, users with a saved dark preference would briefly see the light theme. A small synchronous inline script in `<head>` reads `localStorage` and adds `.dark` to `<html>` before any CSS or JS is evaluated. This is the standard SPA pattern for theme persistence.

```html
<script>
  if (localStorage.getItem("planetos-theme") === "dark") {
    document.documentElement.classList.add("dark");
  }
</script>
```

**Decision: shadcn `Switch` component for the toggle**

The Switch component from shadcn (Base UI Nova preset) matches the existing component style. Install via `pnpm dlx shadcn@latest add switch` in `apps/web`.

*Alternative considered: a plain `<input type="checkbox">`.*  
Rejected — visually inconsistent with the rest of the UI.

**Decision: `ThemeProvider` wraps `RouterProvider` in `main.tsx`**

The provider must be outside `RouterProvider` so all routes (including the root layout's `AppHeader`) can access `useTheme()`. It sits inside `QueryClientProvider` since it doesn't depend on query state.

## Risks / Trade-offs

- [Risk] The inline `<script>` in `index.html` executes before CSP headers could block it in some strict deployments. → Mitigation: the script contains no external fetches or evals; a permissive `script-src 'unsafe-inline'` or a nonce is the standard exemption and is not a current concern for this project.
- [Risk] `localStorage` is not available in private-browsing modes on some browsers. → Mitigation: wrap the read in a try/catch and fall back to light; no error surfaced to the user.
