import type { SeriesInput, EntryInput } from "./types.js";
/**
 * Deterministic content hash per SPEC.md §7 "The hourly sweep" step 1 -
 * sensitive to every listed Entry/Inflection field plus the series' own
 * OPF-relevant fields, independent of the input arrays' original order.
 */
export declare function computeContentHash(series: SeriesInput, entries: EntryInput[]): string;
//# sourceMappingURL=contentHash.d.ts.map