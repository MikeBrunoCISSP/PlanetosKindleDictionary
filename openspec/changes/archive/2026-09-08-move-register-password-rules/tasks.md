## 1. Layout change

- [x] 1.1 In `apps/web/src/routes/login.tsx`'s `RegisterForm`, wrap the Password `FormField` and its password-requirements `<ul>` in a responsive two-column container (`grid gap-4 sm:grid-cols-2 sm:items-start`), moving the `<ul>` out of the Password `FormItem` and into its own sibling column, per the approved plan. Leave the `passwordRequirements.map(...)` body and the Confirm Password `FormField` unchanged and unmoved. Verify `pnpm --filter @planetos/web exec tsc --noEmit` (or the web app's equivalent typecheck script) passes with no errors.
- [x] 1.2 Apply the `sm:self-end` (or equivalent) alignment tweak to the rules `<ul>` so it visually lines up closer to the Password input than the label, per the plan. Verify by eye in the browser (task 2.1) — exact pixel alignment is a judgment call, not a hard requirement.

## 2. Browser verification

- [x] 2.1 Start the web dev server, navigate to `/login?mode=register`, and confirm at a desktop viewport width: the password requirement checklist renders beside (to the right of) the Password field, and the Confirm Password field renders directly below the Password field with nothing in between. Confirm the checklist still live-updates (checkmarks toggle) as a password is typed.
- [x] 2.2 Resize to a narrow/mobile viewport width and confirm the layout still stacks sensibly (checklist below the Password input, as before this change) rather than overflowing or breaking.
- [x] 2.3 Confirm the Confirm Password mismatch indicator still appears/clears correctly beside that field — unrelated to this change, but a quick regression check since it sits in the same form area.

## 3. Final verification

- [x] 3.1 Read through the diff to confirm only `apps/web/src/routes/login.tsx` changed, and that the change is layout-only (no changes to validation logic, form field names, or submit behavior).
- [x] 3.2 `openspec validate move-register-password-rules --type change --strict` passes.
