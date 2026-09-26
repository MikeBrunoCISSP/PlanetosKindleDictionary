## Why

Bulk-imported definitions only get correct treatment for a real `\n` newline character today — `plainTextToSafeHtml` turns each one into a `<br>`, but says nothing about `\r` or `\t`. A `\r` (whether standalone, or paired as `\r\n` in a Windows-authored source file that JSON-escapes it properly) survives as an invisible raw control character embedded in the stored HTML, and a tab passes through unchanged, where normal HTML whitespace collapsing renders it as nothing. Admins importing glossaries from Windows-originated tools or tab-formatted sources currently get silently mangled definitions with no error or warning.

## What Changes

- `plainTextToSafeHtml` (`packages/shared/src/sanitize.ts`) is extended to normalize line-break and tab control characters before converting to HTML:
  - `\r\n` is normalized to two line breaks — the same result as `\n\n` — rather than leaving a stray `\r` next to a single `<br>`.
  - A lone `\r` (not part of a `\r\n` pair) is treated the same as a single `\n` — one line break — for consistent CR/LF/CRLF handling.
  - `\n` continues to produce one line break, unchanged.
  - `\t` is converted to a small run of non-breaking spaces so it renders as visible indentation, instead of collapsing to nothing.
- No changes to the function's signature, its callers, or the request/response shape of the import API — this is a pure behavior refinement inside existing text-to-HTML conversion.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `entries/bulk-import`: the "Newlines in Definitions Become Line Breaks" requirement is broadened to cover `\r`, `\r\n`, and `\t` handling in imported definitions, not just `\n`.

## Impact

- `packages/shared/src/sanitize.ts` — `plainTextToSafeHtml`'s control-character handling.
- `packages/shared/src/__tests__/sanitize.test.ts` — new unit test cases for CRLF, lone CR, and tab handling.
- `apps/api/tests/entryImports.test.ts` — new integration test cases exercising the same behavior end-to-end through the import route.
