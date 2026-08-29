import type { SeriesInput } from "./types.js";
export interface OpfManifestItem {
    id: string;
    path: string;
}
/** Builds the dictionary OPF per SPEC.md §5.5. `items` must already be in spine order. */
export declare function buildOpf(series: SeriesInput, items: OpfManifestItem[], uuid: string, buildDate: Date): string;
//# sourceMappingURL=opf.d.ts.map