import type { PrismaClient } from "@prisma/client";
import type { SeriesInput, EntryInput } from "@planetos/kindle";

const entrySelect = {
  id: true,
  headword: true,
  lookupValue: true,
  sortKey: true,
  definitionHtml: true,
  partOfSpeech: true,
  pronunciation: true,
  spoilerAfterBook: true,
  inflections: {
    select: { value: true, group: true, name: true, exact: true },
  },
} as const;

/** Loads a series' Published+Approved entries and maps everything to packages/kindle's plain input shapes. */
export async function loadSeriesInputs(
  prisma: PrismaClient,
  seriesId: string
): Promise<{ series: SeriesInput; entries: EntryInput[] }> {
  const series = await prisma.series.findUniqueOrThrow({
    where: { id: seriesId },
    include: { books: { select: { ordinal: true, title: true } } },
  });

  const entries = await prisma.entry.findMany({
    where: { seriesId, status: "PUBLISHED", approvalStatus: "APPROVED" },
    orderBy: { sortKey: "asc" },
    select: entrySelect,
  });

  const seriesInput: SeriesInput = {
    id: series.id,
    title: series.title,
    author: series.author,
    description: series.description,
    inLanguage: series.inLanguage,
    outLanguage: series.outLanguage,
    books: series.books,
  };

  const entryInputs: EntryInput[] = entries.map((entry) => ({
    id: entry.id,
    headword: entry.headword,
    lookupValue: entry.lookupValue,
    sortKey: entry.sortKey,
    definitionHtml: entry.definitionHtml,
    partOfSpeech: entry.partOfSpeech,
    pronunciation: entry.pronunciation,
    spoilerAfterBook: entry.spoilerAfterBook,
    inflections: entry.inflections,
  }));

  return { series: seriesInput, entries: entryInputs };
}
