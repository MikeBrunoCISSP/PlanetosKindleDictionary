## Why

The current hamburger menu uses flyout submenus and is hidden entirely from non-admin users, making the navigation feel inconsistent and leaving non-admins with no menu at all. Switching to an inline accordion that is visible to all logged-in users makes the UI more predictable: every user sees the same top-level structure, and the shelf content reflects what they can actually do.

## What Changes

- The hamburger menu in `AppHeader` is now rendered for all logged-in users (not only admins).
- Top-level menu sections ("Create", "Update") expand and collapse in place when clicked, replacing the flyout submenu pattern.
- The expanded shelf shows only the actions the current user has permission to use; if none apply, the shelf is empty.
- The `CommandDialog` for "Update → Dictionary" is retained and opened the same way as before (via a menu item click).

## Capabilities

### New Capabilities

- `navigation/app-menu`: Behavioral contract for the persistent application header menu — visibility rules, accordion expansion, and permission-gated shelf content.

### Modified Capabilities

_(none — the existing specs for auth and admin do not describe header navigation behavior)_

## Impact

- `apps/web/src/components/AppHeader.tsx` — replace `DropdownMenuSub` flyout pattern with accordion state; remove the `isAdmin` render gate on the menu itself.
- shadcn/ui `Accordion` component likely needed (`pnpm dlx shadcn@latest add accordion` in `apps/web`); or built with lightweight toggle state if Accordion is too heavy for this use case (design decision).
