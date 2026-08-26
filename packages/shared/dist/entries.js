import { z } from "zod";
import { plainText } from "./validation.js";
export const DUPLICATE_WORD_MESSAGE = "The word already exists in the dictionary.";
export const definitionHtmlSchema = z
    .string()
    .trim()
    .min(1, "Definition is required")
    .max(5000, "Definition must be at most 5,000 characters");
export const createEntrySchema = z
    .object({
    headword: plainText({ max: 200, minMessage: "Headword is required" }),
    definitionHtml: definitionHtmlSchema,
    inflections: z.array(plainText({ max: 200, minMessage: "Inflection cannot be empty" })).default([]),
})
    .refine((data) => {
    const headword = data.headword.trim().toLowerCase();
    const inflections = data.inflections.map((value) => value.trim().toLowerCase());
    if (inflections.includes(headword))
        return false;
    return new Set(inflections).size === inflections.length;
}, { message: DUPLICATE_WORD_MESSAGE, path: ["inflections"] });
export const submitEntryEditProposalSchema = z
    .object({
    definitionHtml: definitionHtmlSchema,
    inflections: z.array(plainText({ max: 200, minMessage: "Inflection cannot be empty" })).default([]),
})
    .refine((data) => new Set(data.inflections.map((value) => value.trim().toLowerCase())).size === data.inflections.length, { message: DUPLICATE_WORD_MESSAGE, path: ["inflections"] });
export const rejectEntrySchema = z.object({
    note: z.string().max(2000, "Note must be at most 2,000 characters").optional(),
});
export const inflectionDtoSchema = z.object({
    id: z.string(),
    value: z.string(),
});
export const entrySummaryDtoSchema = z.object({
    id: z.string(),
    headword: z.string(),
    createdAt: z.string().datetime(),
});
export const entryDtoSchema = z.object({
    id: z.string(),
    seriesId: z.string(),
    headword: z.string(),
    definitionHtml: z.string(),
    inflections: z.array(inflectionDtoSchema),
    approvalStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]),
    submittedById: z.string().nullable(),
    reviewedById: z.string().nullable(),
    reviewedAt: z.string().datetime().nullable(),
    rejectionNote: z.string().nullable(),
    createdAt: z.string().datetime(),
});
export const publicEntryDtoSchema = z.object({
    id: z.string(),
    seriesId: z.string(),
    seriesSlug: z.string(),
    headword: z.string(),
    definitionHtml: z.string(),
    approvalStatus: z.enum(["PENDING", "APPROVED"]),
    inflections: z.array(inflectionDtoSchema),
});
const entryEditProposalCurrentSchema = z.object({
    headword: z.string(),
    definitionHtml: z.string(),
    inflections: z.array(inflectionDtoSchema),
});
const entryEditProposalProposedSchema = z.object({
    definitionHtml: z.string(),
    inflections: z.array(z.string()),
});
export const entryEditProposalDtoSchema = z.object({
    id: z.string(),
    entryId: z.string(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
    submittedById: z.string().nullable(),
    submittedAt: z.string().datetime(),
    reviewedById: z.string().nullable(),
    reviewedAt: z.string().datetime().nullable(),
    rejectionNote: z.string().nullable(),
    current: entryEditProposalCurrentSchema,
    proposed: entryEditProposalProposedSchema,
});
export const pendingQueueItemDtoSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("NEW_ENTRY"),
        id: z.string(),
        headword: z.string(),
        createdAt: z.string().datetime(),
    }),
    z.object({
        type: z.literal("EDIT"),
        id: z.string(),
        entryId: z.string(),
        headword: z.string(),
        createdAt: z.string().datetime(),
    }),
]);
//# sourceMappingURL=entries.js.map