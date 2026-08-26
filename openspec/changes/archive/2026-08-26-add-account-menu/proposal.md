## Why

Account-level actions — Preferences and Log out — are currently buried three levels deep inside the hamburger menu (open menu → expand "Settings" → click), and nothing in the header tells a visitor who they're logged in as without opening that menu first. A dedicated, always-visible account affordance (icon + username) makes identity and these two actions immediately accessible, and removing the now-redundant "Settings" section keeps the hamburger menu focused on dictionary/entry/admin actions.

## What Changes

- A new account-menu element is added directly to the left of the hamburger menu button in the persistent header:
  - **Logged in**: shows a user icon and the current user's username. Clicking it opens a small popup menu with exactly two items: "Preferences" and "Log out".
  - **Logged out**: shows a "Log In" link (navigating to `/login`) in the same position; the hamburger menu button is not rendered at all for an unauthenticated visitor (unchanged from today — the hamburger already has no anonymous-facing content).
- The hamburger menu's "Settings" section (which today contains only Preferences and Log out) is removed entirely, since both items now live in the new account menu.
- The hamburger's Dictionaries/Entries sections' "closes the previously open section" behavior is otherwise unaffected; only the scenario wording that referenced the now-removed "Settings" section as the previously-open example is updated to reference a still-existing section instead.
- The two menus (hamburger and account) are separate, independently-triggered popups, each with its own state; standard single-popup-at-a-time dismissal applies, so opening one while the other is already open closes the one that was open (the same as clicking outside any other open popup in the app) rather than both being open simultaneously.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `navigation/app-menu`: removes "Settings Section" and "Preferences Item in Settings"; adds "Account Menu for Authenticated Users", "Preferences Item in Account Menu", "Log Out Item in Account Menu", and "Log In Link for Unauthenticated Visitors"; updates "Dictionaries Top-Level Section" and "Entries Top-Level Section" to stop referencing the removed "Settings" section in their close-other-sections scenarios.
- `preferences/user-preferences`: "Preferences Page Accessibility" — updates the reachability description ("Settings → Preferences") to reflect the new Account Menu location.

## Impact

- `apps/web/src/components/AppHeader.tsx`: add a new `AccountMenu` component (or equivalent) rendered to the left of the existing hamburger `AppMenu`, using the existing `DropdownMenu` primitives and `apiLogout`/`ME_QUERY_KEY` logout flow already used by the hamburger's Log out item; remove the "Settings" section (and its `toggleSection`/`openSection` "settings" case) from `AppMenu`.
- `AppHeader`'s top-level render swaps from `{me && <AppMenu me={me} />}` (nothing at all for anonymous) to always rendering the account-affordance slot, branching on `me` between the new logged-in account menu and a "Log In" link, while the hamburger `AppMenu` itself stays gated on `me` as today.
- No backend, schema, or shared-package changes — this is presentational routing of two already-existing actions (`/preferences` navigation, `apiLogout`) plus one already-existing link target (`/login`).
- No new icon dependency — `lucide-react` is already a project dependency and has a suitable user icon.
