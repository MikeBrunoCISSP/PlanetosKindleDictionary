## Context

The app uses Tailwind v4 with shadcn/ui (Base UI primitives). All form inputs already have `w-full min-w-0`. The `Table` component already wraps its `<table>` in a `<div className="relative w-full overflow-x-auto">`. The viewport meta tag is present. The two issues that prevent full mobile compliance are:

1. `Textarea` component uses `field-sizing-content`, a CSS property that auto-sizes the element height to match its content — bypassing `rows` and growing without bound.
2. Admin, Create Dictionary, and Edit Dictionary pages use `p-8` (32 px per side) regardless of viewport.

## Goals / Non-Goals

**Goals:**
- Fix Textarea height behaviour so it is bounded and internally scrollable
- Make page container padding responsive via Tailwind breakpoint utilities

**Non-Goals:**
- Redesigning any page layout or visual appearance
- Adding new responsive breakpoints or custom CSS
- Handling future pages — only fix the pages that currently exist

## Decisions

### Remove `field-sizing-content` from Textarea

`field-sizing-content` is a CSS property (shipped in Chrome 123 / Safari 18) that makes a field resize to fit its content. Shadcn included it to make textareas auto-grow. The spec requirement is the opposite: bounded height with internal scroll.

**Fix:** Remove `field-sizing-content` from the class list. Add `resize-none overflow-y-auto`. The `rows` attribute on the `<textarea>` element then controls the initial rendered height as expected.

Alternative considered: keep `field-sizing-content` and add `max-height` to cap growth. Rejected — a `max-height` cap plus scrollbar is visually indistinguishable from our fix but requires an additional CSS rule and produces a jarring snap when the limit is hit.

### Responsive padding via Tailwind breakpoint prefix

Replace `p-8` with `p-4 sm:p-8` on the three affected pages. Tailwind's `sm:` prefix applies at 640 px and above, which covers tablets and desktops while giving phones 16 px of padding.

Alternative considered: a shared `PageContainer` wrapper component. Rejected — the three pages already manage their own containers with different max-widths (`max-w-5xl` for admin, `max-w-lg` for series forms). A shared component would either be too generic to be useful or would introduce coupling between pages that currently have independent layouts.

## Risks / Trade-offs

- Removing `field-sizing-content` changes the behaviour for any future textarea consumer that expected auto-grow. The `rows` prop is the standard replacement and is already used in the existing callers. [Risk: future author confusion] → Mitigation: the component's `min-h-16` baseline and explicit `rows` usage in callers make the expected height visible in code.
