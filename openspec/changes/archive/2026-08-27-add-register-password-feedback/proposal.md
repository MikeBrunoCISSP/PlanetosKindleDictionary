## Why

The Register form's password feedback only ever shows up after a failed submit attempt — a bundled error message listing every violated rule at once, and a confirm-password mismatch that isn't flagged until the user has already tried to submit. Neither guides the user while they're actually typing.

## What Changes

- The Register form's password field gains an always-visible bulleted checklist of the password requirements (minimum length, uppercase, lowercase, digit); each item switches to a green checkmark the moment its rule is satisfied, live as the user types, and reverts if a later edit makes it unsatisfied again.
- The Confirm Password field shows a mismatch indicator live, as soon as it has content that doesn't match the Password field's current value — not only after a submit attempt.
- The password field's existing bundled error message (the one that lists rule violations as plain text after a failed submit) is removed, since the live checklist now covers that same information more clearly.

## Capabilities

### New Capabilities

(none — this extends the existing auth capability)

### Modified Capabilities

- `auth/login-registration`: the Register form's password/confirm-password feedback becomes live (as-you-type) instead of submit-triggered, and gains a requirement checklist.

## Impact

- **Frontend**: `apps/web/src/routes/login.tsx` (`RegisterForm`'s password/confirmPassword fields).
- **Shared**: `packages/shared/src/auth.ts` (`passwordSchema` refactored to expose its individual rule checks so the frontend checklist and the schema's own validation share one source of truth, rather than duplicating the same regexes).
- **Specs**: `openspec/specs/auth/login-registration/spec.md`.
