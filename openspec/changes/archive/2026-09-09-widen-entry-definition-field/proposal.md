## Why

The Add Entry and Edit Entry screens wrap their entire form (Dictionary picker, Headword, Definition, Inflections) in a `max-w-2xl` (672px) container. The Definition field is a multi-line textarea that already fills 100% of that container's width, so on desktop/tablet it's narrower than it needs to be, forcing more wrapping and scrolling than necessary when writing or reviewing a longer definition. Widening the container gives the Definition field more usable horizontal room wherever the viewport has space to spare.

## What Changes

- Increase the Add Entry and Edit Entry pages' container max-width from `max-w-2xl` (672px) to `max-w-3xl` (768px), on both screens for visual consistency.
- No change to phone-sized viewports: a `max-w-*` cap only constrains the container once the viewport is wider than that value, so at any viewport already narrower than 672px (every phone) the container already fills the available width today and continues to after this change — there is no way for this specific change to reduce mobile usable width.
- No change to the Definition field's own styling, height, or the 5,000-character limit — it already renders at 100% of its container's width (`w-full`) and simply becomes wider as a result of the container change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `entries/submission`: the Definition Field requirement gains a stated wider container on larger viewports, while explicitly remaining fully responsive down to the existing 360px floor.
- `entries/editing`: the Definition Editing requirement gains the same stated width behavior for the edit screen.

## Impact

- `apps/web/src/routes/entries/new.tsx` — the page's outer container class.
- `apps/web/src/routes/entries/$id.tsx` — the page's outer container class (both the loading/error states and the main view).
- Not affected: `apps/web/src/components/ui/textarea.tsx` (no change to the Textarea component itself), the Definition field's validation (`packages/shared/src/entries.ts`), and the several other pages sharing the same `max-w-2xl` convention (Downloads, Series create/edit/detail, Delete Entries, Preferences) - this change is scoped to the Add/Edit Entry screens only, per the request.
