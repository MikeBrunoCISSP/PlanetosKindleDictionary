## Why

The all-dictionaries download page lists every series with at least one successful build, but a series can have a successful build with zero entries (e.g. a newly created series, or one whose entries were all unapproved/removed after it last built). Downloading such a dictionary produces a technically valid but useless EPUB with no words in it. Visitors browsing the download page shouldn't be offered a dictionary that has nothing in it.

## What Changes

- `/api/downloads` (the public listing backing the all-dictionaries download page) additionally excludes a series whose latest successful build has an entry count of zero, not just series with no successful build at all.
- "Empty" is defined by the entry count recorded on the series' most recent successful build (`Build.entryCount`, already tracked for build history) - the same build whose EPUB the page actually links to - not by the series' current live entry count, so what's hidden matches what would actually download.
- No change to the per-series download page, the per-series `/download`/`/download/source` routes, or build history - those already surface a build's entry count where relevant and aren't the target of this request.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `dictionary-management/downloads`: the "All-Dictionaries Download Page" requirement now also excludes a dictionary whose latest successful build contains zero entries, in addition to already excluding one with no successful build.

## Impact

- `apps/api/src/routes/downloads.ts`: `GET /api/downloads` query needs to fetch each candidate series' latest successful build's `entryCount` and filter out series where it's `0`.
- `apps/api/tests/downloads.test.ts`: extend the existing `GET /api/downloads` describe block to cover a series whose latest successful build has zero entries.
- No frontend changes expected: `apps/web/src/routes/downloads.tsx` already renders whatever the API returns and already handles an empty list.
