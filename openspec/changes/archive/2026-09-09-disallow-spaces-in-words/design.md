## Context

See proposal.md - Why. Two things worth stating explicitly since they shape scope decisions below:

- `packages/shared/src/validation.ts`'s `plainText({min,max})` helper is what both `createEntrySchema` and `submitEntryEditProposalSchema` already build Headword/Inflection fields on (`packages/shared/src/entries.ts`). It rejects HTML-tag markup and enforces length, but has no character-class restriction — it currently permits internal whitespace.
- `packages/kindle`'s XHTML generator (`packages/kindle/src/xhtml.ts`) already has defensive handling for a multi-word `headword`: a `lookupValue` field (never set by the app's own UI/API today) that can supply an alternate lookup key, and a `needsLookupValue()` check. Its golden-fixture test (`packages/kindle/src/__tests__/golden.test.ts`) deliberately includes a multi-word headword ("House Stark of Winterfell") to prove the generator doesn't produce broken XHTML for one. That test operates on `EntryInput` directly - it never goes through app-level validation - and it's protecting against already-existing/legacy data, not asserting multi-word headwords are a supported, reachable feature. It stays exactly as-is; see Non-Goals.

## Goals / Non-Goals

**Goals:**
- Reject a Headword or Inflection containing any whitespace character at the point of submission (Add Entry) or edit (Inflection editing), client-side and server-side.

**Non-Goals:**
- No change to `packages/kindle`'s generator, its `lookupValue` handling, or its golden/xhtml tests. That layer intentionally stays defensive against any multi-word headword that already exists (from before this change, or a direct DB write) - removing that would make the generator more fragile for no benefit, since the new restriction only prevents new whitespace-containing words, not clean up old ones.
- No backfill or retroactive validation of already-approved entries. Existing data, if any already has a space in a Headword or Inflection, is untouched and keeps working exactly as it does today.
- No database-level (`CHECK` constraint) enforcement. Every other free-text format rule in this codebase (markup rejection, length limits) is enforced only at the application layer (zod schema + route handler), not the database - this follows the same convention rather than introducing a new one.
- No change to `openspec/specs/search/dictionary-search/spec.md`. Its case-insensitive substring-matching requirement doesn't depend on word count, so no requirement there actually changes - a couple of its scenario examples happen to use a multi-word headword string, but that's illustrative prose, not a behavior this change alters.
- No change to `usernameSchema` or any other `plainText`-based field outside Headword/Inflection (Contact form, `reasonForJoining`, Series title/description, etc.). The request is specifically about the word-creation screen.

## Decisions

### 1. Reject any whitespace character, not just the space character

Use a regex character class for whitespace (`\s`) rather than checking only for `" "`. These are single-line text inputs so a literal tab/newline is unlikely in practice, but the actual constraint being enforced - "this string is not reachable as a single tap-to-lookup token" - is about whitespace in general, not the space character specifically. Cheap to get right up front.

### 2. New shared helper, not a change to `plainText`

Add a small helper in `packages/shared/src/entries.ts` (not `validation.ts`) - something like:

```ts
const singleWordText = (opts: PlainTextOptions) =>
  plainText(opts).refine((value) => !/\s/.test(value), {
    message: "Cannot contain spaces",
  });
```

used in place of `plainText(...)` for `headword` in `createEntrySchema` and for the `inflections` array element schema in both `createEntrySchema` and `submitEntryEditProposalSchema`. Keeping this local to `entries.ts` (rather than adding a parameter to `plainText` itself) avoids touching every other caller of `plainText` (Contact form, Series fields, `reasonForJoining`) and keeps the constraint visibly attached to the two fields it actually applies to.

### 3. Only Headword and Inflections change - no touch to `submitEntryEditProposalSchema`'s absence of a `headword` field

`entries/editing`'s "Headword Is Not Editable" requirement means `submitEntryEditProposalSchema` never accepted a `headword` field in the first place (confirmed: `packages/shared/src/__tests__/entries.test.ts` already asserts `"headword" in result.data` is false for it). Only its `inflections` array needs the new `singleWordText`-based element schema.

### 4. Existing test fixtures using a multi-word word through the real API need updating, not the golden/xhtml fixtures

Four files currently create a real entry (or expect one to be creatable) via the actual create/edit API path using a multi-word Headword or Inflection as a *valid* fixture, and will start failing 400 once this validation exists:

- `packages/shared/src/__tests__/entries.test.ts` - `valid` fixture uses `headword: "Aes Sedai"`.
- `apps/api/tests/entries.test.ts` - creates an entry with `headword: "Aes Sedai"` and inflections `["Aes Sedai's", "Aes-Sedai"]` (the last one, hyphenated, has no whitespace and stays valid as-is).
- `apps/api/tests/entryDetail.test.ts` - same `"Aes Sedai"` headword / `"Aes Sedai's"` inflection pattern.
- `apps/api/tests/search.test.ts` - one test creates an entry with `headword: "Aes Sedai"` to prove a definition-only term match doesn't fire; the multi-word-ness of that particular headword is incidental to what the test checks.

These should be updated to a single-word headword/inflection that preserves each test's actual intent (e.g. swap `"Aes Sedai"` for a single invented word). `packages/kindle`'s golden/xhtml tests are a different, lower layer (see Non-Goals) and are not touched.

## Risks / Trade-offs

- **Any already-approved entry that happens to have a multi-word Headword or Inflection today keeps existing, unenforced, indefinitely.** Mitigation: none needed for the stated goal (stop new bad data from entering); a future cleanup pass, if ever wanted, is a separate change with its own review of what to do with such entries (reject them from generation? require an admin edit?) - explicitly out of scope here.
- **A legitimate compound concept a contributor might want to represent as one lookup term (e.g. "ice cream") has no multi-word escape hatch after this change.** This matches Kindle's own real constraint - such a concept is already not reachable via tap-to-lookup today, so no functionality is being removed; a contributor can still document it under a related single-word entry's definition text.
