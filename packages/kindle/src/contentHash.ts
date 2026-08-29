import { createHash } from "node:crypto";
import type { SeriesInput, EntryInput, InflectionInput } from "./types.js";

function canonicalInflection(inflection: InflectionInput) {
  return {
    value: inflection.value,
    group: inflection.group,
    name: inflection.name,
    exact: inflection.exact,
  };
}

function canonicalEntry(entry: EntryInput) {
  return {
    id: entry.id,
    headword: entry.headword,
    lookupValue: entry.lookupValue,
    sortKey: entry.sortKey,
    definitionHtml: entry.definitionHtml,
    partOfSpeech: entry.partOfSpeech,
    pronunciation: entry.pronunciation,
    spoilerAfterBook: entry.spoilerAfterBook,
    inflections: [...entry.inflections]
      .sort((a, b) => a.value.localeCompare(b.value))
      .map(canonicalInflection),
  };
}

function canonicalSeries(series: SeriesInput) {
  return {
    title: series.title,
    inLanguage: series.inLanguage,
    outLanguage: series.outLanguage,
    books: [...series.books]
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((book) => ({ ordinal: book.ordinal, title: book.title })),
  };
}

/**
 * Deterministic content hash per SPEC.md §7 "The hourly sweep" step 1 -
 * sensitive to every listed Entry/Inflection field plus the series' own
 * OPF-relevant fields, independent of the input arrays' original order.
 */
export function computeContentHash(series: SeriesInput, entries: EntryInput[]): string {
  const canonical = {
    series: canonicalSeries(series),
    entries: [...entries]
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map(canonicalEntry),
  };

  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
