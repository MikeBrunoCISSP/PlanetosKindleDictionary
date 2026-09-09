## 1. Add Entry screen

- [x] 1.1 In `apps/web/src/routes/entries/new.tsx`, change the outer container's `max-w-2xl` to `max-w-3xl`. Verify `pnpm --filter @planetos/web exec tsc --noEmit` passes.

## 2. Edit Entry screen

- [x] 2.1 In `apps/web/src/routes/entries/$id.tsx`, change `max-w-2xl` to `max-w-3xl` on the page's outer container (covering the loading/error states and the main view, so all three stay visually consistent). Verify `pnpm --filter @planetos/web exec tsc --noEmit` passes. (Correction: the loading/error early-return states never had a `max-w-2xl` at all - just `p-8`, no width constraint - so only the one real occurrence, the main view's container, needed changing.)

## 3. Browser verification

- [x] 3.1 With the dev server running, open the Add Entry screen at a desktop-width viewport (e.g. 1280px) and confirm the form (including the Definition field) renders visibly wider than before (up to 768px), via a screenshot or measured element width. (Real bug found and fixed: `__root.tsx` wraps every page in `flex flex-col`, and flexbox's auto cross-axis margins from `mx-auto` suppress the default stretch behavior, so the container was shrink-wrapping to ~333px of content width regardless of its `max-w-*` value - `max-w-2xl` never actually rendered at 672px either. Added `w-full` alongside `max-w-3xl mx-auto` in both files; confirmed via computed width the container now correctly renders at 768px on a 1280px viewport.)
- [x] 3.2 At a phone-sized viewport (360px and 390px), confirm the Add Entry form fits fully within the viewport with no horizontal scrollbar, and the Definition field still wraps text and does not grow wider than its container - matching the existing `ui/responsive-layout` contract. (Confirmed at both 360px and 390px: body scrollWidth === clientWidth, no overflow, screenshot looks correct.)
- [x] 3.3 Repeat 3.1 and 3.2 for the Edit Entry screen (enter edit mode on an existing entry). (Confirmed 768px on a 1280px viewport in both read view and edit mode, and no horizontal overflow at 360px in edit mode.)

## 4. Final verification

- [x] 4.1 `pnpm run typecheck` passes for the whole monorepo.
- [x] 4.2 `openspec validate widen-entry-definition-field --type change --strict` passes.
