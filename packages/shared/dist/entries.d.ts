import { z } from "zod";
export declare const createEntrySchema: z.ZodEffects<z.ZodObject<{
    headword: z.ZodEffects<z.ZodString, string, string>;
    definitionHtml: z.ZodString;
    inflections: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
}, "strip", z.ZodTypeAny, {
    headword: string;
    definitionHtml: string;
    inflections: string[];
}, {
    headword: string;
    definitionHtml: string;
    inflections?: string[] | undefined;
}>, {
    headword: string;
    definitionHtml: string;
    inflections: string[];
}, {
    headword: string;
    definitionHtml: string;
    inflections?: string[] | undefined;
}>;
export declare const rejectEntrySchema: z.ZodObject<{
    note: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    note?: string | undefined;
}, {
    note?: string | undefined;
}>;
export declare const inflectionDtoSchema: z.ZodObject<{
    id: z.ZodString;
    value: z.ZodString;
}, "strip", z.ZodTypeAny, {
    value: string;
    id: string;
}, {
    value: string;
    id: string;
}>;
export declare const entrySummaryDtoSchema: z.ZodObject<{
    id: z.ZodString;
    headword: z.ZodString;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    headword: string;
}, {
    id: string;
    createdAt: string;
    headword: string;
}>;
export declare const entryDtoSchema: z.ZodObject<{
    id: z.ZodString;
    seriesId: z.ZodString;
    headword: z.ZodString;
    definitionHtml: z.ZodString;
    inflections: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        value: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        id: string;
    }, {
        value: string;
        id: string;
    }>, "many">;
    approvalStatus: z.ZodEnum<["PENDING", "APPROVED", "REJECTED"]>;
    submittedById: z.ZodNullable<z.ZodString>;
    reviewedById: z.ZodNullable<z.ZodString>;
    reviewedAt: z.ZodNullable<z.ZodString>;
    rejectionNote: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
    createdAt: string;
    headword: string;
    definitionHtml: string;
    inflections: {
        value: string;
        id: string;
    }[];
    seriesId: string;
    submittedById: string | null;
    reviewedById: string | null;
    reviewedAt: string | null;
    rejectionNote: string | null;
}, {
    id: string;
    approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
    createdAt: string;
    headword: string;
    definitionHtml: string;
    inflections: {
        value: string;
        id: string;
    }[];
    seriesId: string;
    submittedById: string | null;
    reviewedById: string | null;
    reviewedAt: string | null;
    rejectionNote: string | null;
}>;
export type CreateEntryDto = z.infer<typeof createEntrySchema>;
export type RejectEntryDto = z.infer<typeof rejectEntrySchema>;
export type InflectionDto = z.infer<typeof inflectionDtoSchema>;
export type EntrySummaryDto = z.infer<typeof entrySummaryDtoSchema>;
export type EntryDto = z.infer<typeof entryDtoSchema>;
//# sourceMappingURL=entries.d.ts.map