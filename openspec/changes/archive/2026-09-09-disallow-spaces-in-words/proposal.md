## Why

Kindle's on-device "tap/long-press a word to look it up" feature — the entire reason this project generates a Kindle-format dictionary — always resolves to a single word bounded by whitespace under the tap point. Confirmed via research: Amazon's own "Creating Dictionaries" KDP guide only ever shows single-word `idx:orth`/`idx:iform` examples; to select more than one word on a Kindle, a reader must manually drag the selection handles, which routes to a *different* action (Wikipedia/web search) rather than the embedded dictionary's headword index. No source — official docs, the MobileRead wiki, or custom-dictionary-creator guides — describes multi-word phrase headwords as reachable via the normal reading-mode lookup gesture.

The app's own generator (`packages/kindle`) already has a golden-fixture regression test proving it doesn't crash when given a multi-word headword, but that test only guards XML/format validity for already-existing or legacy data — nothing in the app currently lets a contributor set the `lookupValue` escape hatch that would make such an entry reachable, and the app's Add/Edit Entry screens accept a Headword or Inflection containing spaces today with no warning. A contributor can currently submit a phrase like "House Stark of Winterfell" as a Headword, have it approved, and have it silently absent from the one interaction (tap-to-define while reading) the generated dictionary exists to serve.

## What Changes

- Reject any Headword or Inflection containing whitespace at submission time, on both the Add Entry screen and the Edit Entry screen's Inflection fields, with a clear validation message.
- Enforce the same rule server-side in the create-entry and edit-proposal API schemas, independent of client-side validation.
- This only affects new submissions and edits going forward — it does not retroactively touch or invalidate any already-approved entry, and `packages/kindle`'s existing defensive handling of a legacy multi-word headword (should one already exist) is unchanged and out of scope.
- Several existing tests that use a multi-word headword/inflection as a *valid* fixture through the real creation/edit API paths will need updating to a single-word equivalent (they currently pass only because no such restriction exists yet).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `entries/submission`: the Headword Field and Inflection Management requirements gain a character-format constraint (no whitespace).
- `entries/editing`: the Inflection Editing in Edit Mode requirement gains the same constraint (Headword itself is already non-editable there, so only Inflections are affected).

## Impact

- `packages/shared/src/entries.ts` — `createEntrySchema` and `submitEntryEditProposalSchema` (or a new shared word-format helper they use).
- `apps/web/src/routes/entries/new.tsx` and the entry-editing UI — surfacing the new validation message.
- Existing tests using a multi-word headword/inflection as a valid fixture through the real API: `apps/api/tests/entries.test.ts`, `apps/api/tests/entryDetail.test.ts`, `apps/api/tests/search.test.ts`, `packages/shared/src/__tests__/entries.test.ts`.
- Not affected: `packages/kindle`'s generator and its golden/xhtml tests (they operate on already-validated `EntryInput` data and intentionally stay defensive against any pre-existing multi-word headword); `openspec/specs/search/dictionary-search/spec.md`'s illustrative example headwords (its actual matching-behavior requirements don't depend on word count, so no requirement there changes, even though a couple of its scenario examples use a multi-word headword string).
