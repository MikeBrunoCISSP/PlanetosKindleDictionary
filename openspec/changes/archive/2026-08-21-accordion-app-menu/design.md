## Context

`AppHeader` currently uses Base UI `DropdownMenu` with `DropdownMenuSub` flyouts. The previous attempt to embed `Command` inside a nested sub-popup triggered a Base UI `CompositeRootContext` error. The `CommandDialog` workaround is already in place. The new design replaces the flyout sub-menu pattern entirely with an inline accordion inside the dropdown panel.

## Goals / Non-Goals

**Goals:**
- Replace flyout submenus with inline accordion expansion inside the existing dropdown panel.
- Show the menu button to all logged-in users; gate shelf content by role.
- Retain the `CommandDialog` for "Update → Dictionary" (it already works).

**Non-Goals:**
- Changing the header layout or the `CommandDialog` interaction.
- Persisting the open/closed accordion state across page navigation.
- Adding new menu sections beyond Create and Update.

## Decisions

**Decision: Keep `DropdownMenu` as the outer shell, replace `DropdownMenuSub` with local accordion state**

The `DropdownMenu` panel is still the right container — it handles positioning, focus trap, and click-outside dismissal. The problem was the *nested* `DropdownMenuSub` flyouts, not the outer dropdown itself. Replacing `DropdownMenuSub` with a simple `openSection` state variable (`"create" | "update" | null`) and conditional rendering of shelf items inside the popup body eliminates the nested portal/composite-context issue without ripping out the entire dropdown.

*Alternative considered:* Install shadcn `Accordion` and render it inside the dropdown. Rejected — Accordion is a heavy dependency for a two-item menu, and it introduces another Base UI composite component inside an existing one, which risks repeating the composite-context collision.

*Alternative considered:* Replace the `DropdownMenu` entirely with a custom popover panel. Rejected — too much boilerplate for what is effectively a styling change.

**Decision: Single open section at a time (mutual exclusion)**

Clicking a section header sets `openSection` to that section's key (or `null` if it is already open). This satisfies the spec requirement that only one section is expanded at a time and matches standard accordion UX.

**Decision: Empty shelf rendered as an empty `<div>` with padding, not hidden**

When a user has no permission for a section, the shelf still renders but is empty. This satisfies the spec requirement that the section header remains visible and expandable even when there is no content.

## Risks / Trade-offs

- [Risk] The dropdown auto-closes when a menu item is clicked (Base UI default behavior). → The "Dictionary" item in "Update" calls `setCommandOpen(true)` before the dropdown closes, so the `CommandDialog` opens cleanly. No mitigation needed.
- [Risk] Keyboard navigation within the accordion shelf may not be wired to Base UI's composite system. → Shelf items are `DropdownMenuItem` nodes rendered inside `DropdownMenuContent`, so Base UI's keyboard handling covers them normally.
