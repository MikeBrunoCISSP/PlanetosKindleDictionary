## Why

Bulk import currently only accepts a flat `{ headword: definition }` mapping, so an admin importing a glossary that already has inflected forms has no way to bring them in — every inflection would have to be added by hand afterward, one at a time, defeating the point of a bulk import. Letting each imported headword carry its own inflections closes that gap.

## What Changes

- **BREAKING**: The import JSON's per-headword value changes from a plain definition string to an object: `{ "Definition": string, "Inflections": string[] }`. The old flat-string value shape is no longer accepted — this is a clean break, not a dual-format transition period.
- Each inflection must be a single word (no spaces), non-empty, and at most 200 characters, reusing the existing `singleWordText` field rule from `packages/shared/src/entries.ts` — but unlike manual entry creation (which rejects the whole submission on a bad or duplicate inflection), import cleans the list up instead: an inflection that fails that rule, matches its own row's headword, or duplicates another inflection already kept from the same row (case-insensitive, first occurrence wins) is simply left out. The entry is still created with its definition and whatever inflections remain — only the per-entry inflection *count* limit (50, after cleanup) can still skip the row entirely.
- The created entry's inflections are written the same way the single-entry creation route writes them (an `Inflection` row plus a `SeriesWord` row per inflection), so an inflection colliding with an existing headword/inflection elsewhere in the dictionary is caught by the same uniqueness constraint and reported as a skipped duplicate.
- The Import page's "Expected format" sample and the client-side pre-validation of an uploaded file are both updated to reflect the new nested shape.
- The Import page's file-format section is restacked to full width below the file picker (rather than side-by-side), since the new nested sample is taller and needs more horizontal room than the two-column layout gives it — confirmed with the user via a layout mockup.
- The import result response gains a `droppedInflectionCount`. When one or more inflections were dropped anywhere in the import (per the cleanup behavior above), the completion notification is a warning rather than a plain success, indicating that not all inflections could be included — otherwise the notification is the same plain success as today.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `entries/bulk-import`: the accepted file shape, several validation/skip-reason requirements, and the entry-creation requirement all change to account for the new per-headword `{ Definition, Inflections }` object and its inflection-specific validation/duplicate rules.

## Impact

- `packages/shared/src/entryImport.ts` — the loose per-value `z.unknown()` schema stays (validation remains hand-rolled per-row to preserve skip-not-fail semantics), but the route's row-processing logic changes shape entirely.
- `apps/api/src/routes/entryImports.ts` — per-row validation and entry/inflection/revision creation logic.
- `apps/api/tests/entryImports.test.ts` — every existing test payload uses the old flat-string shape and needs rewriting.
- `apps/web/src/routes/entries/import.tsx` — client-side file validation, the "Expected format" sample, and the file-format section's layout (stacked full-width instead of side-by-side).
- `apps/web/src/lib/api.ts` — `apiImportEntries`'s parameter type changes from `Record<string, string>` to the new per-headword object shape.
- `ImportEntriesResultDto` (`packages/shared/src/entryImport.ts`) gains `droppedInflectionCount`, driving the client's choice between a warning and a plain success notification.
