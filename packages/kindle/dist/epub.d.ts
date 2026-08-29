import type { SeriesInput, EntryInput } from "./types.js";
import type { GeneratedFile } from "./zip.js";
/**
 * Assembles the full in-memory file list for a series' Kindle dictionary:
 * mimetype, OCF container, about page, one content document per letter
 * that has entries, and the OPF (SPEC.md §5). `buildDate` is injected for
 * deterministic tests; production callers pass `new Date()`.
 */
export declare function buildDictionaryFiles(series: SeriesInput, entries: EntryInput[], buildDate?: Date): GeneratedFile[];
//# sourceMappingURL=epub.d.ts.map