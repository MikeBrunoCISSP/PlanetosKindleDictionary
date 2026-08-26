## 1. Textarea Component

- [x] 1.1 In `apps/web/src/components/ui/textarea.tsx`, remove `field-sizing-content` from the className string and add `resize-none overflow-y-auto`; verify `pnpm --filter web typecheck` passes

## 2. Page Padding

- [x] 2.1 In `apps/web/src/routes/admin.tsx`, change the `AdminPage` container from `p-8 max-w-5xl mx-auto` to `p-4 sm:p-8 max-w-5xl mx-auto`; verify `pnpm --filter web typecheck` passes
- [x] 2.2 In `apps/web/src/routes/series/new.tsx`, change the `SeriesNewPage` container from `p-8 max-w-lg mx-auto` to `p-4 sm:p-8 max-w-lg mx-auto`; verify `pnpm --filter web typecheck` passes
- [x] 2.3 In `apps/web/src/routes/series/$slug/edit.tsx`, change the `SeriesEditPage` container from `p-8 max-w-lg mx-auto` to `p-4 sm:p-8 max-w-lg mx-auto`; verify `pnpm --filter web typecheck` passes

## 3. Smoke Test

- [x] 3.1 Start the dev server, open the Admin page in a browser at 360 px viewport width, confirm no horizontal page scrollbar appears and the user table scrolls within its own region; then open Create Dictionary or Edit Dictionary, enter multiple lines in the Description field, and confirm the textarea does not grow taller than its initial height and instead shows a vertical scrollbar
