## Why

The web application was built desktop-first and has never been validated at mobile viewport widths. Users on phones or narrow browser windows may encounter horizontal page scrolling, cramped padding, and text areas that grow unboundedly instead of scrolling — all of which make the app unusable on small screens.

## What Changes

- Remove `field-sizing-content` from the `Textarea` component and replace with `resize-none overflow-y-auto` so multi-line fields have a fixed height and scroll internally rather than growing with content.
- Make page-level padding responsive on the Admin, Create Dictionary, and Edit Dictionary pages: `p-8` → `p-4 sm:p-8`, giving 16 px of padding on phones instead of 32 px.

## Capabilities

### New Capabilities

- `ui/responsive-layout`: Behavioral contract covering no horizontal page overflow, contained table scrolling, fixed-height scrollable text areas, and responsive page padding across all authenticated routes.

### Modified Capabilities

_(none — existing capability specs have no behavior changes from this work)_

## Impact

- `apps/web/src/components/ui/textarea.tsx` — Textarea component: remove `field-sizing-content`, add `resize-none overflow-y-auto`
- `apps/web/src/routes/admin.tsx` — Admin page container padding
- `apps/web/src/routes/series/new.tsx` — Create Dictionary page container padding
- `apps/web/src/routes/series/$slug/edit.tsx` — Edit Dictionary page container padding
- No API changes, no new dependencies, no breaking changes
