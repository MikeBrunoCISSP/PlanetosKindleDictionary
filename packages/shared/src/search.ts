import { z } from "zod";

export const searchResultInflectionSchema = z.object({
  value: z.string(),
  matched: z.boolean(),
});

export const searchResultItemSchema = z.object({
  entryId: z.string(),
  headword: z.string(),
  headwordMatched: z.boolean(),
  definitionExcerpt: z.string(),
  inflections: z.array(searchResultInflectionSchema),
  seriesId: z.string(),
  seriesSlug: z.string(),
  seriesTitle: z.string(),
});

export const searchResultsSchema = z.object({
  query: z.string(),
  page: z.number().int(),
  limit: z.number().int(),
  totalCount: z.number().int(),
  totalPages: z.number().int(),
  items: z.array(searchResultItemSchema),
});

export type SearchResultInflectionDto = z.infer<typeof searchResultInflectionSchema>;
export type SearchResultItemDto = z.infer<typeof searchResultItemSchema>;
export type SearchResultsDto = z.infer<typeof searchResultsSchema>;
