## Why

The header's "Log In" link is the only entry point unauthenticated visitors have into both signing in and registering, but its label only mentions signing in. Renaming it to "Log In/Register" makes clear that registration is also available there, without changing where it points.

## What Changes

- The header link shown to unauthenticated visitors changes from "Log In" to "Log In/Register". It continues to navigate to `/login`, the existing combined Sign In/Register page — no routing or behavior change, text only.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `navigation/app-menu`: the "Log In Link for Unauthenticated Visitors" requirement's description and scenarios currently name the link's exact text as "Log In"; updated to "Log In/Register".

## Impact

- `apps/web/src/components/AppHeader.tsx` — the unauthenticated header link's text.
