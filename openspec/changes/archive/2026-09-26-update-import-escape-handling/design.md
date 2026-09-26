## Context

See proposal.md for motivation. Confirmed by reading the actual code:

- `plainTextToSafeHtml` (`packages/shared/src/sanitize.ts`) is a two-step pure function: first it escapes `&` and `<` in the raw text (so imported text can't be mistaken for markup), then it replaces every real `\n` character with `<br>`. It does nothing with `\r` or `\t` today — both pass straight through untouched into the escaped string, then into `sanitizeDefinitionHtml`, which doesn't strip raw control characters either (it operates on tag structure, not text-node whitespace). So a `\r` currently survives as an invisible, embedded control character in stored HTML, and a `\t` renders as nothing once the browser collapses whitespace.
- `plainTextToSafeHtml` has exactly one caller in the whole repo: `apps/api/src/routes/entryImports.ts` (the bulk-import route). `apps/api/src/routes/entries.ts` and `apps/api/src/routes/entryEditProposals.ts` both call `sanitizeDefinitionHtml` directly on HTML the client already produced (a rich-text editor), never going through `plainTextToSafeHtml` — so this change cannot affect either of those routes.
- Because the API receives an already-`JSON.parse`d body, any `\n`/`\r`/`\t` JSON escape sequence in the uploaded file has already been decoded into a real control character before this code runs. This change is about handling those real control characters correctly, not about interpreting literal two-character backslash sequences in the text (confirmed with the user - out of scope).
- Precedent: the original `plainTextToSafeHtml` newline-to-`<br>` behavior was itself a deliberate design decision (Decision 3 in `openspec/changes/archive/2026-09-11-add-entry-bulk-import/design.md`) with an explicit ordering constraint - escape `&`/`<` first, then insert markup - so the markup itself doesn't get re-escaped. This change preserves and extends that same ordering constraint for the new tab-to-spacing step.

## Goals / Non-Goals

**Goals:**
- Normalize `\r\n` and a lone `\r` to the same line-break behavior a real `\n` already gets, so no raw control character is ever left embedded in stored definition HTML.
- Give `\t` a visible effect in rendered output, since a literal tab character collapses to nothing under normal HTML whitespace rules.
- Keep the change confined to `plainTextToSafeHtml` itself - no new function, no change to its signature or callers.

**Non-Goals:**
- No unescaping of literal backslash-letter sequences (e.g. a literal `\` character followed by `n`) as text - only real control characters are handled. (Confirmed with the user; JSON's own escapes are already resolved by `JSON.parse` before this code runs.)
- No change to `entries.ts` or `entryEditProposals.ts` - neither calls `plainTextToSafeHtml`, so neither is affected.
- No change to validation limits, error messages, or the import result response shape.

## Decisions

1. **Line-break normalization, applied to the already `&`/`<`-escaped text, before the `\n`-to-`<br>` replacement**:
   - `text.replace(/\r\n/g, "\n\n")` first, so every `\r\n` pair becomes two real newlines - guaranteeing it produces exactly the same output as an actual `\n\n` would (reuses the existing double-newline behavior rather than special-casing it separately).
   - `.replace(/\r/g, "\n")` next, so any carriage return not already consumed by the pair above (a lone `\r`) becomes a single newline - one line break, consistent with how `\n` is already handled.
   - The existing `.replace(/\n/g, "<br>")` step then runs unchanged, now operating over the normalized text.
   - **Alternative considered**: handling `\r\n`/`\r` with a single combined regex (e.g. `/\r\n?/g` sometimes mapped to one break, sometimes two) - rejected because it can't distinguish "paired, so two breaks" from "lone, so one break" in a single substitution without capturing groups and conditional replacement, which is harder to read than two sequential, order-dependent `.replace()` calls for no performance benefit at this text size.
2. **Tab-to-spacing, applied after the `\n`-to-`<br>` step**: `.replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;")` - four non-breaking spaces per tab, chosen because it must run after the initial `&`/`<` escaping step (otherwise the `&` inside `&nbsp;` would itself get escaped to `&amp;nbsp;`), the same ordering constraint the original code already documents for `<br>`. Four was chosen as a small, fixed visual indent (roughly one typical tab-stop's worth) rather than a configurable width - there's no existing per-user or per-series formatting preference to key a variable width off of, and a fixed small indent is enough to make the character visible instead of invisible.
   - **Alternative considered**: leaving `\t` as a literal tab character - rejected per the user's explicit preference, since normal HTML whitespace collapsing would render it identically to a single space, making it effectively invisible and defeating the purpose of "supporting" it.
   - **Alternative considered**: stripping `\t` entirely - rejected for the same reason (no visible effect, silently drops content the admin intentionally included).
3. **Order of operations overall**: escape `&`/`<` → normalize `\r\n`/`\r` → convert `\n` to `<br>` → convert `\t` to spacing. Each step only touches characters the prior steps don't produce or consume (the `&`/`<` escape only ever inserts `&amp;`/`&lt;`, neither of which contains `\r`, `\n`, or `\t`; the line-break normalization only touches `\r`/`\n`; the `<br>` insertion only touches `\n`; the tab-to-spacing step only touches `\t`), so there's no risk of one step's output being re-processed by an earlier or later step.

## Risks / Trade-offs

- **[Risk]** `plainTextToSafeHtml` runs before `definitionHtmlSchema`'s length check in `entryImports.ts`, so expanding a `\r\n` into two `<br>` tags or a `\t` into four `&nbsp;` entities makes the resulting HTML longer than the source text - a definition that's borderline-length in its raw form could now be pushed over the limit and skipped as invalid where it wouldn't have been before this change. → **Mitigation**: none needed - this is a pre-existing characteristic of the pipeline (the current `\n`-to-`<br>` expansion already has the same effect), not a new risk introduced by this change, and the per-row skip-not-fail architecture already handles an oversized definition gracefully (the row is skipped with a clear reason, the rest of the file still imports).
- **[Risk]** A definition that already contained a literal `&nbsp;`-equivalent Unicode non-breaking space character (U+00A0) from tab conversion could look slightly different in a plain-text excerpt (`definitionExcerpt`, used for search results) than a normal space, since `decodeHtmlEntities` doesn't specifically map `&nbsp;`. → **Mitigation**: none needed - `sanitizeHtml`'s parser decodes `&nbsp;` into an actual U+00A0 character when stripping tags for the excerpt, which then displays visually indistinguishable from a normal space in almost all fonts/renderers; no literal `&nbsp;` text is ever left showing.

## Migration Plan

Pure function-level behavior change, no data model or API shape change. No feature flag: the new normalization applies to every import from the moment this ships. No migration of previously-imported entries - their already-stored `definitionHtml` is unaffected; only definitions imported after this change get the new normalization. Rollback is a plain revert of `plainTextToSafeHtml`.
