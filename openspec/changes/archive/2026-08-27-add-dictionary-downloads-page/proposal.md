## Why

Right now the only way to download a dictionary's EPUB is to already know its `/series/:slug` page. Nothing on the homepage or in the menu tells a visitor that dictionaries are downloadable at all, and there's no single place to grab every dictionary's latest build in one visit. Discoverability, not capability, is the gap: the download pipeline itself (from `add-kindle-dictionary-automation`) already works.

## What Changes

- Add a new public page listing every dictionary that has a successful build, each with a direct download link for its latest EPUB.
- Add a "Download the latest dictionaries" hyperlink on the homepage, beneath the search box, linking to that page.
- Add a "Download" item under the menu's "Dictionaries" section, linking to the same page.
- **BREAKING (menu visibility)**: the hamburger menu button, previously rendered only for logged-in users, is now rendered for anonymous visitors too — showing a minimal menu with only the Dictionaries section, containing only the new "Download" item. Authenticated users see it unchanged, with "Download" added alongside the existing Dictionaries items.
- Every EPUB download (the new page and the existing per-series page) is now served with a filename following the pattern `<Dictionary>_<ddMMMyyyyhhmm>.epub`, where `<Dictionary>` is the series title with non-URL-safe characters replaced and the timestamp is the serving build's completion time (24-hour). Previously the browser saw whatever the storage key's basename was.

## Capabilities

### New Capabilities

(none — this extends two existing capabilities)

### Modified Capabilities

- `dictionary-management/downloads`: adds the all-dictionaries download page, its homepage entry point, and the new EPUB filename-naming behavior (applies to every EPUB download route, not just the new page).
- `navigation/app-menu`: the hamburger menu is now rendered for anonymous visitors (minimal content: Dictionaries > Download only); the Dictionaries section and its shelf are now visible to all visitors, not just authenticated ones; adds the "Download" action item.

## Impact

- **Backend**: `apps/api/src/routes/downloads.ts` (new public list endpoint, filename on the existing download route), `apps/api/src/lib/storage.ts` (presigned URL gains an optional response filename), a new small filename-sanitizing helper.
- **Frontend**: new `apps/web/src/routes/downloads.tsx` page; `apps/web/src/routes/index.tsx` (homepage link); `apps/web/src/components/AppHeader.tsx` (hamburger menu rendering logic reworked for anonymous visitors, new Download item).
- **Specs**: `openspec/specs/dictionary-management/downloads/spec.md`, `openspec/specs/navigation/app-menu/spec.md`.
