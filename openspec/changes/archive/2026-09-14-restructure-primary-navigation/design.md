## Context

See proposal.md for motivation. This note covers the routing mechanics and a
few decisions that came out of researching the current code (all confirmed
by reading `apps/web/src/routes/*` and `apps/web/src/components/AppHeader.tsx`
directly, not assumed) plus two follow-ups resolved with the user while
reviewing the approved mock (https://claude.ai/code/artifact/41009e6e-061f-425c-9972-5ce72cbd9479):

1. `/downloads` keeps rendering independently once `/` also shows the same
   content — no redirect between them.
2. The three existing `navigate({ to: "/" })` "success" redirects in
   `entries/new.tsx`, `series/new.tsx`, and `series/$slug/edit.tsx` move to
   `/search`, preserving today's actual post-submit UX now that `/` no
   longer shows search.

## Goals / Non-Goals

**Goals:**
- Swap what `/` renders without breaking any existing link that already
  points at `/downloads`, `/`, or `/entries/new`.
- Add the top menu strip and the hamburger's new "Search" item without
  touching unrelated parts of `AppHeader.tsx`.
- Keep the "Create" eligibility check honest: the strip's computed link is a
  UX nicety, not a new trust boundary (confirmed with the user — the route's
  own `beforeLoad` and the API's `requireApproved` preHandler are the real
  enforcement, independent of what any link points at).

**Non-Goals:**
- No change to how downloads, search, or entry submission actually work
  server-side — this is purely a client-side routing/navigation
  restructuring.
- No new auth state or permission check — "signed in and approved" is
  exactly the same condition `/entries/new`'s existing guard already uses.

## Decisions

- **Shared component over duplicated route markup.** `DownloadsPageContent`
  is extracted once and rendered by both `index.tsx` and `downloads.tsx`.
  Considered: making `/` a client-side redirect to `/downloads` instead —
  rejected per the resolved question above, since it would change the
  address bar unnecessarily and add a redirect hop for no benefit once both
  routes show identical content anyway.
- **Strip as a sibling of `AppHeader`, not folded into it.** Keeps
  `AppHeader.tsx`'s existing, already-detailed logic (account menu,
  hamburger accordion, delete/update dialogs) untouched and independently
  reviewable from the new strip. `__root.tsx` becomes
  `<AppHeader /><TopMenuStrip /><Outlet />`.
- **"Create" eligibility computed in the strip component itself** via
  `useMe()`, mirroring how `AppHeader.tsx` already conditionally renders
  "Log In/Register" vs. the account menu based on the same hook. No new
  route-level redirect page for the strip's own click — clicking "Create"
  goes straight to the correct destination, matching how the rest of the
  header already behaves.
- **`/get-involved` is a single static page**, not two variants — it reads
  `useMe()` only to swap a small piece of copy (register CTA vs.
  "awaiting approval" note), not to gate access. Anyone can view it,
  including an already-approved user who navigates there directly (no
  guard needed; it's just informational).
- **Requirement renames handled via `RENAMED` + `MODIFIED` together** in the
  `search/dictionary-search` delta. `/opsx:sync`'s archive step is an
  agent-driven manual merge (confirmed by reading its own instructions),
  not a rigid diff tool, so applying a rename and a body rewrite to the same
  requirement in one pass is safe and avoids leaving a requirement titled
  "Homepage" that no longer describes the homepage.
- **`search/dictionary-search`'s `## Purpose` line is a deliberate manual
  touch-up, not part of this delta.** A delta's `## Purpose` for an
  existing capability is always ignored by the tooling; the line "...search
  across every dictionary's entries from the homepage..." reads slightly
  stale after this change but isn't incorrect enough to block anything.
  Whoever runs `/opsx:sync` for this change should reword it directly in
  the main spec while syncing (noted so it isn't silently forgotten).

- **Three scenario titles stay literally unchanged even though their bodies now describe the new routes** (`branding/app-name`'s "Homepage heading", `entries/submission`'s "Pending member is redirected away from the screen", `search/dictionary-search`'s "First visit to the homepage"). `openspec validate --strict` treats a MODIFIED requirement's scenario list as name-preserving — it has no RENAMED concept at the scenario level, only at the requirement level — so renaming these titles to match their new content is treated as silently dropping the old scenario. Whoever runs `/opsx:sync` can rename these titles by hand in the main spec once merged, if desired; leaving them as-is is not incorrect, just slightly dated wording.

## Risks / Trade-offs

- **Stale `useMe()` cache could momentarily mis-point "Create."** `useMe()`
  has a 5-minute `staleTime`. If an admin approves a user and that user
  clicks "Create" before their own client re-fetches `/api/auth/me`, the
  strip might still link to `/get-involved` for a few seconds. Mitigation:
  none needed — this is a UX nicety, not a security gate, and the same
  staleness already exists today for the account-menu/login-link swap in
  `AppHeader.tsx`, so this isn't a new class of issue.
- **Every existing bookmark/link to `/` changes meaning** (now downloads
  instead of search). Mitigation: `/search` exists as of this same change,
  so nothing is lost — only relocated. Flagged explicitly as a **BREAKING**
  bullet in proposal.md so it isn't missed in review.
- **Six spec files touched across five existing capabilities plus one new
  one** is a wide blast radius for what is, code-wise, a fairly small
  change. Mitigation: each delta is scoped to exactly the sentence(s) that
  actually reference "the homepage" or the old redirect target — no
  unrelated requirements were touched.
