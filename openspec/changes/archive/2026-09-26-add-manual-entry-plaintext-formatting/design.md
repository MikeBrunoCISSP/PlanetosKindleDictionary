## Context

See proposal.md for motivation. Confirmed by reading the actual code:

- `apps/web/src/routes/entries/new.tsx` and `apps/web/src/routes/entries/$id.tsx` both bind the Definition field to a plain shadcn `Textarea` via `register("definitionHtml")` — react-hook-form sends the raw textarea value verbatim (`apps/web/src/lib/api.ts`'s `apiCreateEntry`/`apiSubmitEntryEditProposal` do a plain `JSON.stringify`, no client-side transform). There is no rich-text editor anywhere in `apps/web/src` (confirmed via broad search for tiptap/contentEditable/prosemirror/quill/slate and equivalents).
- `apps/api/src/routes/entries.ts:109` and `apps/api/src/routes/entryEditProposals.ts:174` both call `sanitizeDefinitionHtml(body.definitionHtml)` directly, with no newline handling.
- `sanitizeDefinitionHtml`'s allowlist (`packages/shared/src/sanitize.ts`) was designed, per `openspec/changes/archive/2026-08-25-add-entry-approval-workflow/design.md`, on the assumption that `definitionHtml` "is meant to hold markup" supplied by the caller — but no UI was ever built to author that markup, so every real user has always been typing/pasting plain prose into what looks like an ordinary text box.
- The bulk-import route already solves exactly this problem for its own `Definition` field via `plainTextToSafeHtml` (`packages/shared/src/sanitize.ts`), which this session already extended to correctly handle `\r`, `\r\n`, and `\t` in addition to `\n`.
- Confirmed with the user: no existing entries rely on hand-typed HTML tags (including the internal cross-reference `<a href="#e0042">` syntax) in the Definition field.

## Goals / Non-Goals

**Goals:**
- Make manual entry creation and editing treat their Definition field the same way bulk import already treats its `Definition` field: plain text in, safe formatted HTML out.
- Reuse the existing `plainTextToSafeHtml` function unchanged — no new text-processing logic.
- Apply the same treatment identically to both the create path and the edit-proposal path (both the non-admin pending-revision flow and the admin immediate-apply flow), so behavior is consistent across every way a Definition can be written.

**Non-Goals:**
- No rich-text editor, toolbar, or any new UI affordance for authoring HTML — out of scope for this fix.
- No change to `packages/shared/src/sanitize.ts` itself.
- No change to the bulk-import route, which already has this behavior.
- No attempt to preserve hand-typed HTML tags as functioning markup — explicitly and knowingly given up per the user's confirmation that nothing currently relies on it.

## Decisions

1. **Reuse `plainTextToSafeHtml` as-is, applied identically in both routes**: change `sanitizeDefinitionHtml(body.definitionHtml)` to `sanitizeDefinitionHtml(plainTextToSafeHtml(body.definitionHtml))` in both `apps/api/src/routes/entries.ts` and `apps/api/src/routes/entryEditProposals.ts`. This is the exact composition `entryImports.ts` already uses.
   - **Alternative considered**: writing a small wrapper/helper shared by all three routes instead of each importing `plainTextToSafeHtml` and `sanitizeDefinitionHtml` separately - rejected as unnecessary indirection; the composition is already a one-line, self-explanatory call, and `entryImports.ts` already establishes the pattern directly at the call site without a wrapper.
2. **No conditional/heuristic detection of "already-HTML" input** (e.g. skipping the conversion when the text happens to contain an allowlisted tag) - rejected during planning (see the AskUserQuestion in this session) as inconsistent and surprising: behavior would depend on incidental content rather than a predictable rule. The user explicitly chose the simple, consistent plain-text treatment over this option.
3. **Apply to both the create route and the edit-proposal route, not just one**: both currently share the identical `sanitizeDefinitionHtml(body.definitionHtml)` pattern and the identical plain-`Textarea` UI, so leaving one path unfixed would reintroduce the same bug asymmetrically (e.g. a new entry created correctly, then immediately "fixed" incorrectly by an edit, or vice versa).
4. **Reverse the conversion client-side when populating the Edit form** (discovered during browser verification, resolved with the user): `apps/web/src/routes/entries/$id.tsx`'s edit form populates its textarea and dirty-state baseline directly from `entry.definitionHtml` - the raw stored HTML. Once storage can contain real `<br>` tags and non-breaking spaces (as of Decision 1), that raw markup would show as literal visible text in the textarea, and resubmitting it unchanged would have `plainTextToSafeHtml` re-escape it into garbage on the next save. Fixed with a new client-side-only helper, `apps/web/src/lib/definitionPlainText.ts`'s `definitionHtmlToPlainText`, used to populate both `useForm`'s `defaultValues.definitionHtml` and `baselineRef.current.definition` in place of the raw `entry.definitionHtml`.
   - **Approach**: build a detached DOM node, replace `<br>`/`<br/>`/`<br />` with `\n` first (since assigning to `.innerHTML` and then stripping tags would otherwise discard them with no trace), assign the result to `.innerHTML`, then read `.textContent` - the browser's own parser handles entity decoding (`&amp;`, `&lt;`, etc.) for free, exactly matching what it will render, with no risk of drifting from the browser's own interpretation. A final regex collapses a run of four non-breaking-space characters (`plainTextToSafeHtml`'s fixed per-tab expansion) back to a single tab.
   - **Alternative considered**: reuse `packages/shared/src/sanitize.ts`'s `sanitizeHtml` + `decodeHtmlEntities` (the same approach `definitionExcerpt` already uses server-side) - rejected because `sanitize-html` is deliberately excluded from the web bundle (`packages/shared/src/index.ts`'s comment: it's Node-oriented and would leak server-only dependencies into the Vite build). A plain client-side DOM helper needs no new dependency and reuses the exact same trust boundary `$id.tsx`'s read-only view already relies on (`entry.definitionHtml` is sanitized server-side before it can ever reach the client).
   - This is populated once per edit session via `useMemo`, matching `baselineRef`'s existing "captured once, at mount" pattern - it is not expected to react to `entry.definitionHtml` changing later during the same edit session, consistent with how `baselineRef` already behaves.

## Risks / Trade-offs

- **[Risk]** Any hand-typed HTML tags in a Definition (bold/italic/cross-reference links) stop rendering as markup and instead show as literal visible text. → **Mitigation**: confirmed with the user before implementation that no existing entries rely on this; this is an accepted, explicit trade-off, not an oversight.
- **[Risk]** Same pre-existing length-limit-expansion characteristic already accepted for bulk import (`openspec/changes/update-import-escape-handling/design.md`) applies here too: converting newlines/tabs into longer HTML happens before the 5,000-character `definitionHtmlSchema` check, so a borderline-length submission could newly exceed the limit. → **Mitigation**: none needed beyond what was already accepted for import - the created/edited entry is simply rejected with the existing over-length validation message, not silently truncated or corrupted.
- **[Risk]** Existing tests in `apps/api/tests/entries.test.ts` and `apps/api/tests/entryEditProposals.test.ts` that assert an exact submitted `definitionHtml` value (e.g. `.toBe("<p>...</p>")`) will fail once `<` is escaped. → **Mitigation**: addressed directly in tasks.md - these assertions are identified and updated as part of implementation, and new tests are added covering the paragraph/CRLF/tab behavior this change introduces.
- **[Risk]** Re-opening Edit on an entry whose definition already contains generated `<br>`/non-breaking-space markup and resubmitting without touching the affected text would silently corrupt it (real markup escaped back into visible literal text) - reproduced live during browser verification. → **Mitigation**: Decision 4 - the edit form now shows and diffs against a reversed plain-text form of the stored HTML, so what the admin sees and edits is never raw markup, and an unrelated edit elsewhere in the text no longer touches it.

## Migration Plan

Pure route-level behavior change, no data model or API shape change. No feature flag: the new normalization applies to every entry creation and edit submitted after this ships. No migration of previously-created entries - their already-stored `definitionHtml` is unaffected either way. Rollback is a plain revert of the two one-line route changes.
