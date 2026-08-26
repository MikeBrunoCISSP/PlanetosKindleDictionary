import { z } from "zod";
import { plainText } from "./validation.js";

export const createSeriesSchema = z.object({
  title: plainText({ max: 200, minMessage: "Title is required" }),
  description: plainText({ max: 5000, minMessage: "Description is required" }),
});

export const updateSeriesSchema = z
  .object({
    title: plainText({ max: 200, minMessage: "Title cannot be empty" }),
    description: plainText({ max: 5000, minMessage: "Description cannot be empty" }),
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
