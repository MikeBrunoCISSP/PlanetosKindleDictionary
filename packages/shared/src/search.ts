import { z } from "zod";

// Fastify's default query-string parser (Node's `querystring` module)
// collapses a query param that appears exactly once into a bare string
// rather than a one-element array: `?seriesIds=x` -> { seriesIds: "x" },
// but `?seriesIds=x&seriesIds=y` -> { seriesIds: ["x","y"] }. Selecting a
// single dictionary is the common case, so without this preprocess Zod
// would reject exactly that request. On the web side (TanStack Router's
// own JSON-based search-param serialization) the value is already a real
// array by the time Zod sees it, so this preprocess is a no-op there -
// safe to share between the API's and the web's own search schemas.
export const seriesIdsFilterSchema = z
  .preprocess(
    (v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]),
    z.array(z.string().min(1)).min(1)
  )
  .optional();

export type SeriesIdsFilter = z.infer<typeof seriesIdsFilterSchema>;

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
