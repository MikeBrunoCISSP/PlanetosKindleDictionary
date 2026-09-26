// Reverses the server's plainTextToSafeHtml (packages/shared/src/sanitize.ts)
// for populating the edit form's plain-text control from already-stored
// HTML. Without this, re-opening an entry for editing would show raw
// <br>/&nbsp; markup as literal visible text, and resubmitting it
// unchanged would have that markup re-escaped into garbage on save.
//
// Uses a detached DOM node rather than a regex/entity-decode table: the
// browser's own HTML parser already handles every entity definitionHtml
// can legally contain (it's sanitized server-side to a strict allowlist
// before it can ever reach the client), so this needs no new dependency
// and can't drift from what the browser itself will render.
export function definitionHtmlToPlainText(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html.replace(/<br\s*\/?>/gi, "\n");
  const text = container.textContent ?? "";
  // plainTextToSafeHtml's own inverse: it turns one tab into exactly four
  // non-breaking spaces, so collapse that back to a tab.
  return text.replace(/ {4}/g, "\t");
}
