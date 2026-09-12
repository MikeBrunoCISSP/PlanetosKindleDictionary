## Why

Search today always runs across every dictionary at once, with no way to narrow results to just the dictionaries someone cares about. Each result already shows which dictionary it came from — a filter makes that dimension usable instead of just informational.

## What Changes

- The search results view gains a dictionary filter, presented as a multi-select: a trigger that opens a picker listing all dictionaries with checkable items, plus the current selection shown as removable chips.
- Selecting one or more dictionaries narrows search results to only those dictionaries; selecting none behaves exactly as today (search across everything).
- The selection is part of the page's URL state, so it persists across pagination and is shareable/bookmarkable like the existing query and page parameters.

## Capabilities

### New Capabilities
_None._

### Modified Capabilities
- `search/dictionary-search`: gains a new requirement for the dictionary filter (selection narrows results; no selection is unfiltered; selection persists across pagination).

## Impact

- `packages/shared/src/search.ts`: new `seriesIdsFilterSchema`, shared between the API and web query schemas — handles a Fastify query-string parsing quirk (a single selected value arrives as a bare string, not a one-element array).
- `apps/api/src/routes/search.ts`: accepts an optional `seriesIds` filter and adds a conditional, parameterized `WHERE` clause to the existing raw search query.
- `apps/api/tests/search.test.ts`: new test cases for the filter, including the single-selection edge case.
- `apps/web/src/lib/api.ts`: `apiGetSeriesList` gains an optional `limit` param; `apiSearchEntries` gains a `seriesIds` param.
- `apps/web/src/components/DictionaryMultiSelect.tsx` (new): the multi-select control, built on the existing `Command`-based picker primitives (which already support a checked-item visual state, unused until now).
- `apps/web/src/routes/index.tsx`: the search page's URL schema and rendering gain the filter.
- `apps/web/src/components/SearchResults.tsx`: threads the filter through to the search query.
