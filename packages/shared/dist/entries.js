import { z } from "zod";
import { plainText } from "./validation.js";
const DUPLICATE_WORD_MESSAGE = "The word already exists in the dictionary.";
export const createEntrySchema = z
    .object({
    headword: plainText({ max: 200, minMessage: "Headword is required" }),
    definitionHtml: z
        .string()
        .min(1, "Definition is required")
        .max(5000, "Definition must be at most 5,000 characters"),
    inflections: z.array(plainText({ max: 200, minMessage: "Inflection cannot be empty" })).default([]),
})
    .refine((data) => {
    const headword = data.headword.trim().toLowerCase();
    const inflections = data.inflections.map((value) => value.trim().toLowerCase());
    if (inflections.includes(headword))
        return false;
    return new Set(inflections).size === inflections.length;
}, { message: DUPLICATE_WORD_MESSAGE, path: ["inflections"] });
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
//# sourceMappingURL=entries.js.map