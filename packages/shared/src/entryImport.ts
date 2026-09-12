import { z } from "zod";

// Generous multiple of a real ~1,500-entry glossary sample file - only
// bites pathological/abusive files, not a real-world import.
export const MAX_IMPORT_ENTRIES = 5000;

// Caps the response payload size on a huge file - counts stay exact even
// when the headword lists below are capped.
export const IMPORT_RESULT_LIST_CAP = 200;

// Values are z.unknown(), not z.string(): a z.record(z.string(), z.string())
// would make Zod reject the entire request on the first non-string value,
// which contradicts "skip bad rows, don't fail the batch." The per-row type
// check happens by hand in the route's processing loop instead.
export const importEntriesRequestSchema = z.object({
  entries: z
    .record(z.string(), z.unknown())
    .refine((v) => Object.keys(v).length > 0, { message: "The file contains no entries." })
    .refine((v) => Object.keys(v).length <= MAX_IMPORT_ENTRIES, {
      message: `An import file can contain at most ${MAX_IMPORT_ENTRIES} entries.`,
    }),
});

export const importSkippedItemDtoSchema = z.object({
  headword: z.string(),
  reason: z.string(),
});

export const importEntriesResultDtoSchema = z.object({
  totalInFile: z.number().int(),
  createdCount: z.number().int(),
  skippedDuplicateCount: z.number().int(),
  skippedInvalidCount: z.number().int(),
  createdHeadwords: z.array(z.string()),
  skippedDuplicateHeadwords: z.array(z.string()),
  skippedInvalid: z.array(importSkippedItemDtoSchema),
  truncated: z.boolean(),
});

export type ImportEntriesRequestDto = z.infer<typeof importEntriesRequestSchema>;
export type ImportSkippedItemDto = z.infer<typeof importSkippedItemDtoSchema>;
export type ImportEntriesResultDto = z.infer<typeof importEntriesResultDtoSchema>;
