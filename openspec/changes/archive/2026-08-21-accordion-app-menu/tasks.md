## 1. Refactor AppHeader

- [x] 1.1 In `apps/web/src/components/AppHeader.tsx`, remove the `isAdmin` render gate on the menu button so it renders for all logged-in users; add `openSection: "create" | "update" | null` state; replace the two `DropdownMenuSub` blocks with plain `DropdownMenuItem` section headers that toggle `openSection` on click, followed by conditionally rendered shelf items (admin-only) using `DropdownMenuItem`; verify `pnpm --filter web typecheck` passes

## 2. Smoke Test

- [ ] 2.1 Log in as an admin, open the menu, and verify: clicking "Create" shows a "Dictionary" item inline below it; clicking "Update" collapses "Create" and shows a "Dictionary" item; clicking the open section again collapses it; clicking "Dictionary" under "Update" opens the `CommandDialog`
- [ ] 2.2 Log in as a member, open the menu, and verify: "Create" and "Update" section headers are visible; expanding either section shows an empty shelf with no items
