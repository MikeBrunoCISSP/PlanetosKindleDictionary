## Why

Seeding a dictionary today means adding entries one at a time through the "Add Entry" form. An admin who already has a glossary export (e.g. a wiki dump mapping headwords to definitions) has no way to bulk-load it, making it impractical to stand up a new, large dictionary.

## What Changes

- A new admin-only "Import" page (linked from the Entries menu) lets an admin pick a dictionary and upload a JSON file shaped as a flat object of `{ headword: definition }` pairs.
- The file is validated client-side (valid JSON, correct shape) before the Import button enables; an inline error is shown next to the file chooser on failure, and the file name is shown on success.
- On import, the API creates a new entry for each headword, skipping any that already exist in that dictionary (case-insensitive), skipping malformed rows (non-string value, multi-word headword, empty or oversized definition) individually rather than failing the whole batch, and converting embedded newline characters in plain-text definitions into real line breaks.
- Imported entries are auto-approved, matching how an admin's own single-entry submissions are already auto-approved today.
- The page shows an indeterminate progress indicator during the import request and a toast summarizing how many entries were created vs. skipped (and why) when it finishes.

## Capabilities

### New Capabilities
- `entries/bulk-import`: the import page's behavior contract — who can access it, what a valid file looks like, per-row validation and skip rules, duplicate handling (including within the same file), newline-to-line-break conversion, and the result summary shown to the admin.

### Modified Capabilities
- `navigation/app-menu`: the Entries section gains a third, admin-only shelf item ("Import") alongside the existing "Add" and "Delete".

## Impact

- `packages/shared/src/entryImport.ts` (new): request/response Zod schemas for the import endpoint.
- `packages/shared/src/entries.ts`: export the existing `singleWordText` validator for reuse.
- `packages/shared/src/sanitize.ts`: new `plainTextToSafeHtml` helper (escape + newline-to-`<br>` conversion).
- `apps/api/src/routes/entryImports.ts` (new): `POST /api/series/:slug/entries/import`, admin-only.
- `apps/api/src/index.ts`, `apps/api/tests/helpers.ts`: register the new route.
- `apps/web/src/routes/entries/import.tsx` (new): the import page.
- `apps/web/src/components/ui/progress.tsx` (new): indeterminate progress bar.
- `apps/web/src/lib/api.ts`: new `apiImportEntries` function.
- `apps/web/src/components/AppHeader.tsx`: new "Import" menu item under Entries.
