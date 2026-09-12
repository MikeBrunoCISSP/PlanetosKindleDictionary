import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = ["p", "b", "i", "em", "strong", "sup", "sub", "br", "ul", "ol", "li", "span", "a"];

// Internal cross-reference hrefs only, e.g. "#e0042" (SPEC.md §5.3's idx:entry id format).
const INTERNAL_REF_PATTERN = /^#e\d+$/;

/**
 * Sanitizes entry definition HTML to the strict allowlist SPEC.md §5.4
 * requires. Run on write (not on render) - store sanitized HTML, never
 * trust what came in.
 */
export function sanitizeDefinitionHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href"],
    },
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: attribs["href"] && INTERNAL_REF_PATTERN.test(attribs["href"]) ? { href: attribs["href"] } : {},
      }),
    },
  });
}

// Escapes so a stray "<" or "&" in imported plain text can't be mistaken
// for markup, then turns newlines into real line breaks - for plain-text
// sources (e.g. a bulk-import file) that were never meant to carry HTML.
// Escaping happens before the "<br>" tags are inserted so the tags
// themselves aren't escaped too. Run the result through
// sanitizeDefinitionHtml as well before storing it (defense-in-depth,
// consistent with the single-entry write path).
export function plainTextToSafeHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return escaped.replace(/\n/g, "<br>");
}

// sanitize-html re-escapes text nodes for safe HTML re-serialization (its
// output is still HTML, not plain text) - decode the handful of entities it
// can produce so callers get real plain text.
const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39|apos);/g, (match) => HTML_ENTITIES[match] ?? match);
}

/**
 * Strips all markup from an already-sanitized definitionHtml value and
 * truncates to a plain-text excerpt (maxLength characters + "..." if the
 * plain text was longer). Truncation is a literal character count, not
 * word-boundary aware.
 */
export function definitionExcerpt(definitionHtml: string, maxLength = 256): string {
  const stripped = sanitizeHtml(definitionHtml, { allowedTags: [], allowedAttributes: {} });
  const plainText = decodeHtmlEntities(stripped).trim();
  if (plainText.length <= maxLength) return plainText;
  return plainText.slice(0, maxLength) + "...";
}
