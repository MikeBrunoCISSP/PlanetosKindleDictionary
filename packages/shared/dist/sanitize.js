import sanitizeHtml from "sanitize-html";
const ALLOWED_TAGS = ["p", "b", "i", "em", "strong", "sup", "sub", "br", "ul", "ol", "li", "span", "a"];
// Internal cross-reference hrefs only, e.g. "#e0042" (SPEC.md §5.3's idx:entry id format).
const INTERNAL_REF_PATTERN = /^#e\d+$/;
/**
 * Sanitizes entry definition HTML to the strict allowlist SPEC.md §5.4
 * requires. Run on write (not on render) - store sanitized HTML, never
 * trust what came in.
 */
export function sanitizeDefinitionHtml(html) {
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
// sanitize-html re-escapes text nodes for safe HTML re-serialization (its
// output is still HTML, not plain text) - decode the handful of entities it
// can produce so callers get real plain text.
const HTML_ENTITIES = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
};
function decodeHtmlEntities(text) {
    return text.replace(/&(?:amp|lt|gt|quot|#39|apos);/g, (match) => HTML_ENTITIES[match] ?? match);
}
/**
 * Strips all markup from an already-sanitized definitionHtml value and
 * truncates to a plain-text excerpt (maxLength characters + "..." if the
 * plain text was longer). Truncation is a literal character count, not
 * word-boundary aware.
 */
export function definitionExcerpt(definitionHtml, maxLength = 256) {
    const stripped = sanitizeHtml(definitionHtml, { allowedTags: [], allowedAttributes: {} });
    const plainText = decodeHtmlEntities(stripped).trim();
    if (plainText.length <= maxLength)
        return plainText;
    return plainText.slice(0, maxLength) + "...";
}
//# sourceMappingURL=sanitize.js.map