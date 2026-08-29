import type { EntryInput } from "./types.js";
export interface EntryPlacement {
    id: string;
    letter: string;
    entry: EntryInput;
}
/**
 * Assigns every entry a stable, sequential, deterministic id (SPEC.md §5.3)
 * and its destination per-letter content file, in sortKey order. This is
 * pass one of the two-pass build - pass two (renderContentFile) uses the
 * resulting id->placement map to rewrite cross-reference hrefs to their
 * correct target file.
 */
export declare function assignPlacements(entries: EntryInput[]): EntryPlacement[];
/** Groups placements by their destination letter, preserving sortKey order within each letter. */
export declare function groupByLetter(placements: EntryPlacement[]): Map<string, EntryPlacement[]>;
export declare function escapeXmlText(value: string): string;
export declare function escapeXmlAttr(value: string): string;
/** Renders one per-letter content document (SPEC.md §5.2 skeleton + §5.3 entries). */
export declare function renderContentFile(placements: EntryPlacement[], byId: Map<string, EntryPlacement>): string;
//# sourceMappingURL=xhtml.d.ts.map