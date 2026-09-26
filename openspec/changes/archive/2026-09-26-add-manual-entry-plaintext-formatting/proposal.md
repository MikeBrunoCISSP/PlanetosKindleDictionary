## Why

The manual "Add Entry" and "Edit Entry" Definition fields are plain textareas with no rich-text editor, so a user pastes or types ordinary prose. Unlike the bulk-import path (`plainTextToSafeHtml`), neither `apps/api/src/routes/entries.ts` nor `apps/api/src/routes/entryEditProposals.ts` converts a blank-line paragraph break, `\r`/`\r\n`, or a tab into a visible line break/spacing before sanitizing — HTML whitespace collapsing then silently runs paragraphs together with no visible gap. Confirmed with the user: no existing content relies on hand-typed HTML tags in this field, so it should be brought in line with how bulk import already treats plain text.

## What Changes

- **BREAKING**: `apps/api/src/routes/entries.ts` and `apps/api/src/routes/entryEditProposals.ts` now run the submitted `definitionHtml` through `plainTextToSafeHtml` (the same function bulk import uses) before sanitizing it. A blank-line paragraph break, a Windows-style `\r\n`, a lone `\r`, and a tab are now converted into visible line breaks/spacing, exactly matching bulk-import behavior.
- **BREAKING**: any literal `<` or `&` a user types (e.g. hand-authored HTML tags, or ordinary text like "Fish & chips") is now escaped and stored/rendered as literal visible text rather than being interpreted as markup. This includes the internal cross-reference `<a href="#e0042">` link syntax the sanitizer's allowlist supports — hand-typing it no longer produces a working link. Confirmed with the user that no existing entries rely on this.
- No change to `packages/shared/src/sanitize.ts` itself — this reuses the `plainTextToSafeHtml` normalization already extended (in this same working session) to handle `\r`, `\r\n`, and `\t`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `entries/submission`: the "Definition Field" requirement is extended to describe plain-text normalization (line breaks, tabs) and literal-character escaping, matching bulk import.
- `entries/editing`: the "Definition Editing" requirement gets the same extension.

## Impact

- `apps/api/src/routes/entries.ts` — single-entry creation's definition-processing step.
- `apps/api/src/routes/entryEditProposals.ts` — edit-proposal submission's definition-processing step (both the non-admin pending-revision path and the admin immediate-apply path).
- `apps/api/tests/entries.test.ts` and `apps/api/tests/entryEditProposals.test.ts` — existing assertions that compare a stored `definitionHtml` to a literal `<p>...</p>`-style string need updated expectations; new test cases cover paragraph/CRLF/tab normalization.
- `apps/web/src/lib/definitionPlainText.ts` (new) and `apps/web/src/routes/entries/$id.tsx` — the Edit form now shows a reversed plain-text form of the stored HTML instead of raw markup, so re-editing an entry never displays or resubmits literal `<br>`/`&nbsp;` text (found during browser verification of this change).
