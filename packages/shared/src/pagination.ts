import { z } from "zod";

/** A cursor-paginated page of items (PERF-002). `nextCursor` is an opaque
 * string to echo back for the next page, or null when this page was the
 * last one. */
export function pagedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
  });
}
