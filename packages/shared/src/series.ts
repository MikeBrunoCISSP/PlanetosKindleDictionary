import { z } from "zod";

export const createSeriesSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
});

export const updateSeriesSchema = z
  .object({
    title: z.string().min(1, "Title cannot be empty"),
    description: z.string().min(1, "Description cannot be empty"),
  })
  .partial()
  .refine((v) => v.title !== undefined || v.description !== undefined, {
    message: "At least one of title or description must be provided",
  });

export const seriesListItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
});

export const seriesDtoSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  inLanguage: z.string(),
  outLanguage: z.string(),
  createdAt: z.string().datetime(),
  createdById: z.string().nullable(),
});

export type CreateSeriesDto = z.infer<typeof createSeriesSchema>;
export type UpdateSeriesDto = z.infer<typeof updateSeriesSchema>;
export type SeriesListItemDto = z.infer<typeof seriesListItemSchema>;
export type SeriesDto = z.infer<typeof seriesDtoSchema>;
