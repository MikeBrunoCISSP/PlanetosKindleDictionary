import { z } from "zod";
export declare const searchResultInflectionSchema: z.ZodObject<{
    value: z.ZodString;
    matched: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    value: string;
    matched: boolean;
}, {
    value: string;
    matched: boolean;
}>;
export declare const searchResultItemSchema: z.ZodObject<{
    entryId: z.ZodString;
    headword: z.ZodString;
    headwordMatched: z.ZodBoolean;
    definitionExcerpt: z.ZodString;
    inflections: z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        matched: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        value: string;
        matched: boolean;
    }, {
        value: string;
        matched: boolean;
    }>, "many">;
    seriesId: z.ZodString;
    seriesSlug: z.ZodString;
    seriesTitle: z.ZodString;
}, "strip", z.ZodTypeAny, {
    headword: string;
    inflections: {
        value: string;
        matched: boolean;
    }[];
    seriesId: string;
    entryId: string;
    headwordMatched: boolean;
    definitionExcerpt: string;
    seriesSlug: string;
    seriesTitle: string;
}, {
    headword: string;
    inflections: {
        value: string;
        matched: boolean;
    }[];
    seriesId: string;
    entryId: string;
    headwordMatched: boolean;
    definitionExcerpt: string;
    seriesSlug: string;
    seriesTitle: string;
}>;
export declare const searchResultsSchema: z.ZodObject<{
    query: z.ZodString;
    page: z.ZodNumber;
    limit: z.ZodNumber;
    totalCount: z.ZodNumber;
    totalPages: z.ZodNumber;
    items: z.ZodArray<z.ZodObject<{
        entryId: z.ZodString;
        headword: z.ZodString;
        headwordMatched: z.ZodBoolean;
        definitionExcerpt: z.ZodString;
        inflections: z.ZodArray<z.ZodObject<{
            value: z.ZodString;
            matched: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            value: string;
            matched: boolean;
        }, {
            value: string;
            matched: boolean;
        }>, "many">;
        seriesId: z.ZodString;
        seriesSlug: z.ZodString;
        seriesTitle: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        headword: string;
        inflections: {
            value: string;
            matched: boolean;
        }[];
        seriesId: string;
        entryId: string;
        headwordMatched: boolean;
        definitionExcerpt: string;
        seriesSlug: string;
        seriesTitle: string;
    }, {
        headword: string;
        inflections: {
            value: string;
            matched: boolean;
        }[];
        seriesId: string;
        entryId: string;
        headwordMatched: boolean;
        definitionExcerpt: string;
        seriesSlug: string;
        seriesTitle: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    query: string;
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    items: {
        headword: string;
        inflections: {
            value: string;
            matched: boolean;
        }[];
        seriesId: string;
        entryId: string;
        headwordMatched: boolean;
        definitionExcerpt: string;
        seriesSlug: string;
        seriesTitle: string;
    }[];
}, {
    query: string;
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    items: {
        headword: string;
        inflections: {
            value: string;
            matched: boolean;
        }[];
        seriesId: string;
        entryId: string;
        headwordMatched: boolean;
        definitionExcerpt: string;
        seriesSlug: string;
        seriesTitle: string;
    }[];
}>;
export type SearchResultInflectionDto = z.infer<typeof searchResultInflectionSchema>;
export type SearchResultItemDto = z.infer<typeof searchResultItemSchema>;
export type SearchResultsDto = z.infer<typeof searchResultsSchema>;
//# sourceMappingURL=search.d.ts.map