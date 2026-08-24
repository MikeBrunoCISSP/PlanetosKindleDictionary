import { z } from "zod";
export declare const createSeriesSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodString;
}, "strip", z.ZodTypeAny, {
    title: string;
    description: string;
}, {
    title: string;
    description: string;
}>;
export declare const updateSeriesSchema: z.ZodEffects<z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    title?: string | undefined;
    description?: string | undefined;
}, {
    title?: string | undefined;
    description?: string | undefined;
}>, {
    title?: string | undefined;
    description?: string | undefined;
}, {
    title?: string | undefined;
    description?: string | undefined;
}>;
export declare const seriesListItemSchema: z.ZodObject<{
    id: z.ZodString;
    slug: z.ZodString;
    title: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    title: string;
    description: string | null;
    slug: string;
}, {
    id: string;
    title: string;
    description: string | null;
    slug: string;
}>;
export declare const seriesDtoSchema: z.ZodObject<{
    id: z.ZodString;
    slug: z.ZodString;
    title: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    inLanguage: z.ZodString;
    outLanguage: z.ZodString;
    createdAt: z.ZodString;
    createdById: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    title: string;
    description: string | null;
    slug: string;
    inLanguage: string;
    outLanguage: string;
    createdById: string | null;
}, {
    id: string;
    createdAt: string;
    title: string;
    description: string | null;
    slug: string;
    inLanguage: string;
    outLanguage: string;
    createdById: string | null;
}>;
export type CreateSeriesDto = z.infer<typeof createSeriesSchema>;
export type UpdateSeriesDto = z.infer<typeof updateSeriesSchema>;
export type SeriesListItemDto = z.infer<typeof seriesListItemSchema>;
export type SeriesDto = z.infer<typeof seriesDtoSchema>;
//# sourceMappingURL=series.d.ts.map