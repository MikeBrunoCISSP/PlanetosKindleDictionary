## Why

Dictionary downloads should be the first thing a visitor sees, not search — and every page should offer a persistent, always-visible way to reach the app's main actions (Downloads, Search, Create, Help) rather than requiring the hamburger menu for everything. A mock of the new layout was built and approved with the user (role-switcher covering anonymous/pending/approved/admin visitors) before this proposal was written.

## What Changes

- `/` (the homepage) now renders the same content as `/downloads`; both remain independently reachable, showing the same dictionary list and Kindle-conversion instructions. No redirect — the content is rendered directly at both URLs.
- Today's homepage content (the search box and results) moves to a new route, `/search`, unchanged in behavior.
- A new persistent top-of-page menu strip renders on every page, beneath the existing header, with four items:
  - **Downloads** → `/downloads`
  - **Search** → `/search`
  - **Create** → `/entries/new` if signed in and approved (or admin); otherwise a new static page, `/get-involved`, explaining that registering and being approved is required to add/edit dictionary entries
  - **Help** → `/contact`
- The existing hamburger menu's "Entries" section gains a new "Search" item (above "Add"), visible to the same audience as "Add" (all authenticated users), navigating to `/search`.
- `/entries/new`'s existing redirect for a signed-in-but-pending user changes from `/` to `/get-involved`, so a direct/bookmarked visit lands on the explanation rather than a generic page.
- Three existing "success → go home" redirects (after adding an entry, creating a dictionary, editing a dictionary) change from `/` to `/search`, preserving today's actual post-submit experience now that `/` no longer shows search.
- **BREAKING** (internal only, no external API): any bookmarked deep link relying on `/` showing the search UI will instead see the downloads page; the search UI is still fully available at `/search`.

## Capabilities

### New Capabilities

- `navigation/top-menu-strip`: the persistent top-of-page navigation strip and its four items, including the eligibility-based routing for "Create" and the explainer page it can lead to.

### Modified Capabilities

- `navigation/app-menu`: the hamburger menu's "Entries" shelf gains a new "Search" item.
- `dictionary-management/downloads`: the all-dictionaries download page's content is now also served at `/`; the old "Download the latest dictionaries" homepage hyperlink is removed as redundant.
- `search/dictionary-search`: the search experience moves from `/` to `/search`; requirement names and bodies referencing "the homepage" are updated to reference the search page.
- `branding/app-name`: the "homepage heading" requirement location becomes "the search page heading," since that's where the branded heading (and the rest of the search UI) now lives.
- `entries/submission`: pins down that a Pending user visiting `/entries/new` is redirected specifically to the Create eligibility explainer page, not just "redirected away."

## Impact

- `apps/web/src/routes/index.tsx`, `apps/web/src/routes/downloads.tsx`, new `apps/web/src/routes/search.tsx`, new `apps/web/src/routes/get-involved.tsx`, new `apps/web/src/components/DownloadsPageContent.tsx`, new `apps/web/src/components/TopMenuStrip.tsx`.
- `apps/web/src/routes/__root.tsx` (render the new strip), `apps/web/src/components/AppHeader.tsx` (new hamburger item), `apps/web/src/components/SearchResults.tsx` (pagination target).
- `apps/web/src/routes/entries/new.tsx`, `apps/web/src/routes/series/new.tsx`, `apps/web/src/routes/series/$slug/edit.tsx` (redirect targets).
- No API or database changes — this is entirely a web-app routing/navigation restructuring.
