import { z } from "zod";
export declare const DUPLICATE_WORD_MESSAGE = "The word already exists in the dictionary.";
export declare const definitionHtmlSchema: z.ZodString;
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
export declare const submitEntryEditProposalSchema: z.ZodEffects<z.ZodObject<{
    definitionHtml: z.ZodString;
    inflections: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
}, "strip", z.ZodTypeAny, {
    definitionHtml: string;
    inflections: string[];
}, {
    definitionHtml: string;
    inflections?: string[] | undefined;
}>, {
    definitionHtml: string;
    inflections: string[];
}, {
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
export declare const publicEntryDtoSchema: z.ZodObject<{
    id: z.ZodString;
    seriesId: z.ZodString;
    seriesSlug: z.ZodString;
    headword: z.ZodString;
    definitionHtml: z.ZodString;
    approvalStatus: z.ZodEnum<["PENDING", "APPROVED"]>;
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
}, "strip", z.ZodTypeAny, {
    id: string;
    approvalStatus: "PENDING" | "APPROVED";
    headword: string;
    definitionHtml: string;
    inflections: {
        value: string;
        id: string;
    }[];
    seriesId: string;
    seriesSlug: string;
}, {
    id: string;
    approvalStatus: "PENDING" | "APPROVED";
    headword: string;
    definitionHtml: string;
    inflections: {
        value: string;
        id: string;
    }[];
    seriesId: string;
    seriesSlug: string;
}>;
export declare const entryEditProposalDtoSchema: z.ZodObject<{
    id: z.ZodString;
    entryId: z.ZodString;
    status: z.ZodEnum<["PENDING", "APPROVED", "REJECTED"]>;
    submittedById: z.ZodNullable<z.ZodString>;
    submittedAt: z.ZodString;
    reviewedById: z.ZodNullable<z.ZodString>;
    reviewedAt: z.ZodNullable<z.ZodString>;
    rejectionNote: z.ZodNullable<z.ZodString>;
    current: z.ZodObject<{
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
    }, "strip", z.ZodTypeAny, {
        headword: string;
        definitionHtml: string;
        inflections: {
            value: string;
            id: string;
        }[];
    }, {
        headword: string;
        definitionHtml: string;
        inflections: {
            value: string;
            id: string;
        }[];
    }>;
    proposed: z.ZodObject<{
        definitionHtml: z.ZodString;
        inflections: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        definitionHtml: string;
        inflections: string[];
    }, {
        definitionHtml: string;
        inflections: string[];
    }>;
}, "strip", z.ZodTypeAny, {
    status: "PENDING" | "APPROVED" | "REJECTED";
    id: string;
    submittedById: string | null;
    reviewedById: string | null;
    reviewedAt: string | null;
    rejectionNote: string | null;
    entryId: string;
    submittedAt: string;
    current: {
        headword: string;
        definitionHtml: string;
        inflections: {
            value: string;
            id: string;
        }[];
    };
    proposed: {
        definitionHtml: string;
        inflections: string[];
    };
}, {
    status: "PENDING" | "APPROVED" | "REJECTED";
    id: string;
    submittedById: string | null;
    reviewedById: string | null;
    reviewedAt: string | null;
    rejectionNote: string | null;
    entryId: string;
    submittedAt: string;
    current: {
        headword: string;
        definitionHtml: string;
        inflections: {
            value: string;
            id: string;
        }[];
    };
    proposed: {
        definitionHtml: string;
        inflections: string[];
    };
}>;
export declare const pendingQueueItemDtoSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"NEW_ENTRY">;
    id: z.ZodString;
    headword: z.ZodString;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "NEW_ENTRY";
    id: string;
    createdAt: string;
    headword: string;
}, {
    type: "NEW_ENTRY";
    id: string;
    createdAt: string;
    headword: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"EDIT">;
    id: z.ZodString;
    entryId: z.ZodString;
    headword: z.ZodString;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "EDIT";
    id: string;
    createdAt: string;
    headword: string;
    entryId: string;
}, {
    type: "EDIT";
    id: string;
    createdAt: string;
    headword: string;
    entryId: string;
}>]>;
export type CreateEntryDto = z.infer<typeof createEntrySchema>;
export type SubmitEntryEditProposalDto = z.infer<typeof submitEntryEditProposalSchema>;
export type RejectEntryDto = z.infer<typeof rejectEntrySchema>;
export type InflectionDto = z.infer<typeof inflectionDtoSchema>;
export type EntrySummaryDto = z.infer<typeof entrySummaryDtoSchema>;
export type EntryDto = z.infer<typeof entryDtoSchema>;
export type PublicEntryDto = z.infer<typeof publicEntryDtoSchema>;
export type EntryEditProposalDto = z.infer<typeof entryEditProposalDtoSchema>;
export type PendingQueueItemDto = z.infer<typeof pendingQueueItemDtoSchema>;
//# sourceMappingURL=entries.d.ts.map