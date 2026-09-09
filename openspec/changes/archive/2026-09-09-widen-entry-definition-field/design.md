## Context

See proposal.md - Why. Both `apps/web/src/routes/entries/new.tsx` and `apps/web/src/routes/entries/$id.tsx` wrap their form in a single outer `<div className="... max-w-2xl ...">`. Tailwind's `max-w-*` utilities are a ceiling, not a target: below that width the element simply fills its available width (minus padding), and above it the element stops growing. `max-w-2xl` = 672px, `max-w-3xl` = 768px.

## Goals / Non-Goals

**Goals:**
- Give the Definition field more horizontal room on viewports wide enough to benefit (tablet/desktop).
- Leave phone-sized rendering identical to today.

**Non-Goals:**
- Redesigning the Add/Edit Entry form layout, or making the Definition field wider than its sibling fields (Headword, Dictionary picker) within the same form - the whole form's container widens together, matching the existing pattern where every field is `w-full` within one shared container.
- Changing any other page that happens to share the `max-w-2xl` convention (Downloads, Series screens, Preferences) - explicitly out of scope per the proposal.

## Decisions

### 1. Bump the container from `max-w-2xl` (672px) to `max-w-3xl` (768px)

A single-step increase is enough to give the Definition textarea meaningfully more width (~14%) without making the Headword/Dictionary-picker fields (which don't need extra width) look stretched or unbalanced. Considered `max-w-4xl` (896px, ~33% wider) as a more dramatic option; rejected for now as a bigger visual change than the request called for - easy to bump further later if it's still not wide enough in practice.

### 2. Why this can't regress mobile: the mechanics of `max-w-*`

`max-w-2xl` and `max-w-3xl` are both larger than every phone viewport width (typically 360-430px). A `max-w-*` value only ever constrains the element once the viewport (minus the page's own padding) exceeds that value - below it, the element already fills 100% of the available width today, and continues to after this change, because the new ceiling (768px) is still far above any phone width. This isn't a mitigation applied on top of the change; it's simply how the utility behaves, which is why the proposal states this as a fact rather than a risk to manage. Verification (task 3) confirms this empirically rather than relying on the reasoning alone.

## Risks / Trade-offs

- **Tablet portrait width (~768-820px) sits right at the new ceiling.** At exactly 768px the form would span edge-to-edge if page padding didn't apply; the existing `p-4 sm:p-8` padding on both pages already insets the content, so this isn't a new concern - same padding behavior as today, just with a wider inner cap.
