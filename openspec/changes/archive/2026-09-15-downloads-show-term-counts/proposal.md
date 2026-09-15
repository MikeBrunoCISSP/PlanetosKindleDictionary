## Why

The all-dictionaries download page currently hides any dictionary that has no successful build yet, or whose latest build has zero entries. That makes newly-requested or not-yet-contributed-to dictionaries invisible, even though they're exactly the ones that most need a visitor to discover them and sign up to contribute. Visitors also have no way to gauge a dictionary's size (a proxy for how useful/complete it is) before downloading.

## What Changes

- The all-dictionaries download page (and the homepage, which renders the same content) now lists **every** series, regardless of whether it has a successful build or how many entries that build has.
- Each row gains a **term count** column showing the entry count of the dictionary's latest successful build.
  - If that count is zero (no successful build yet, or a successful build with zero entries), the column shows a dash (`—`) instead of `0`.
- Each row also gains a **last modified** column showing when that latest successful build completed, formatted `MMM dd yyyy HH:mm` (e.g. `Jan 06 2026 14:30`) and rendered in the visitor's own local timezone.
  - If the term count is zero, the last-modified column shows a dash too, even if a build technically completed — a zero-entry build has nothing meaningful to report as "modified."
- Dictionaries are grouped with every non-zero-term dictionary above every zero-term dictionary, alphabetically by title within each group. This replaces the previous plain alphabetical-by-title ordering.
- For a dictionary whose term count is zero, the row no longer shows a download link. Instead it shows the text **"Contribute Now!"**, linking to the sign-in/register page (`/login`).
  - Its title is also shown dimmed (muted color), to keep visual emphasis on dictionaries a visitor can actually download.
- Dictionaries with a non-zero term count keep their existing "Download .epub" link, unchanged.
- **BREAKING**: `GET /api/downloads` now returns every series (previously only series with a non-empty successful build), sorted populated-first, and adds `entryCount` and `lastModifiedAt` fields to each entry in the response.

## Capabilities

### Modified Capabilities

- `dictionary-management/downloads`: the "All-Dictionaries Download Page" requirement changes from listing only non-empty, successfully-built dictionaries to listing every dictionary, adding term-count and last-modified columns, and replacing the download link with a "Contribute Now!" call-to-action for dictionaries with zero terms. A new "All-Dictionaries List Ordering" requirement is added for the populated-first sort.

## Impact

- **API**: `apps/api/src/routes/downloads.ts` — `GET /api/downloads` drops its `entryCount > 0` filter, includes `entryCount` and `lastModifiedAt` in the response DTO, and sorts results populated-first (alphabetical within each group) in application code.
- **Web**: `apps/web/src/components/DownloadsPageContent.tsx` and `apps/web/src/lib/api.ts` (`apiGetDownloads` return type) — render every dictionary, add term-count and last-modified columns (the latter formatted client-side in the visitor's local timezone), dim the title and show "Contribute Now!" in place of the download link for zero-term dictionaries.
- **Tests**: `apps/api/tests/downloads.test.ts` — existing assertions that empty/unbuilt dictionaries are excluded need to be updated to reflect the new inclusive, populated-first-sorted behavior, plus coverage for `lastModifiedAt`.
