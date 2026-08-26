/**
 * Sanitizes entry definition HTML to the strict allowlist SPEC.md §5.4
 * requires. Run on write (not on render) - store sanitized HTML, never
 * trust what came in.
 */
export declare function sanitizeDefinitionHtml(html: string): string;
/**
 * Strips all markup from an already-sanitized definitionHtml value and
 * truncates to a plain-text excerpt (maxLength characters + "..." if the
 * plain text was longer). Truncation is a literal character count, not
 * word-boundary aware.
 */
export declare function definitionExcerpt(definitionHtml: string, maxLength?: number): string;
//# sourceMappingURL=sanitize.d.ts.map