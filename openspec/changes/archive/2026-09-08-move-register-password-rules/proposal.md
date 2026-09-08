## Why

The Register form currently shows the password complexity checklist directly beneath the Password field, which pushes the Confirm Password field further down the page than necessary and leaves the form feeling taller than it needs to be. Moving the checklist beside the Password field tightens the layout and puts Confirm Password immediately below Password, matching the arrangement requested for this screen.

## What Changes

- The Register form's password requirement checklist moves from beneath the Password field to beside it (a two-column arrangement on wider viewports).
- The Confirm Password field, already the next field after Password in the form, now renders directly below it with no checklist in between.
- No change to validation, submission behavior, the checklist's live-updating logic, or the Confirm Password mismatch indicator's own behavior — this is a layout-only change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `auth/login-registration`: the "Combined Login/Registration Page" requirement's password-checklist scenario and the "Password Requirement Checklist" requirement both currently describe the checklist as appearing "beneath" the Password field; both are updated to describe it appearing beside the field instead. A new scenario is added confirming Confirm Password renders directly below Password with nothing between them.

## Impact

- `apps/web/src/routes/login.tsx` — `RegisterForm`: restructure the Password field and its requirement checklist into a side-by-side layout; Confirm Password field itself is unmoved.
