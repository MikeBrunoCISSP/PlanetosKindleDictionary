import { describe, it, expect } from "vitest";
import { buildDictionaryFiles } from "../epub.js";
import type { SeriesInput, EntryInput } from "../types.js";

// Fixture covering every characteristic SPEC.md §9 calls out as the main
// defense against silently breaking the Kindle format: accented characters,
// an apostrophe in a headword, a superscript inside a definition (headword
// itself is always plain text in this schema, so a literal superscript
// headword character isn't representable - the format's <sup> support is
// exercised via definitionHtml instead), a multi-word headword, an
// inflection spanning multiple grammatical groups, and a cross-reference
// between two entries in different letter files. Any snapshot diff here
// must be reviewed by a human before accepting, per SPEC's own reasoning.
const series: SeriesInput = {
  id: "golden-series",
  title: "Golden Fixture Dictionary",
  author: "Fixture Author",
  description: "A small fixture series exercising every Kindle-format edge case.",
  inLanguage: "en",
  outLanguage: "en",
  books: [{ ordinal: 1, title: "Book One" }],
};

const entries: EntryInput[] = [
  {
    id: "e-cafe",
    headword: "Café",
    lookupValue: null,
    sortKey: "cafe",
    definitionHtml: "<p>A coffee house, accented headword case.</p>",
    partOfSpeech: "n.",
    pronunciation: null,
    spoilerAfterBook: null,
    inflections: [],
  },
  {
    id: "e-aes-sedai",
    headword: "Aes Sedai's",
    lookupValue: "Aes Sedai",
    sortKey: "aes sedai's",
    // Cross-reference hrefs target the Kindle-assigned sequential id
    // (SPEC.md §5.3/packages/shared's sanitizer only ever allow "#e\d+"),
    // never the raw database entry id - "e0006" here is Winterfell's actual
    // assigned id given this fixture's sortKey ordering (verified below).
    definitionHtml: '<p>Possessive form, apostrophe case. See <a href="#e0006">Winterfell</a>.</p>',
    partOfSpeech: "n.",
    pronunciation: null,
    spoilerAfterBook: null,
    inflections: [],
  },
  {
    id: "e-footnote",
    headword: "Footnoted Term",
    lookupValue: null,
    sortKey: "footnoted term",
    definitionHtml: "<p>A term with a superscript reference<sup>3</sup> in its definition.</p>",
    partOfSpeech: null,
    pronunciation: null,
    spoilerAfterBook: null,
    inflections: [],
  },
  {
    id: "e-house-stark",
    headword: "House Stark of Winterfell",
    lookupValue: null,
    sortKey: "house stark of winterfell",
    definitionHtml: "<p>A multi-word headword case.</p>",
    partOfSpeech: null,
    pronunciation: null,
    spoilerAfterBook: null,
    inflections: [],
  },
  {
    id: "e-run",
    headword: "Run",
    lookupValue: null,
    sortKey: "run",
    definitionHtml: "<p>To move quickly. Inflections span both verb and noun groups.</p>",
    partOfSpeech: "v., n.",
    pronunciation: "/rʌn/",
    spoilerAfterBook: null,
    inflections: [
      { value: "Ran", group: "verb", name: "past tense", exact: false },
      { value: "Running", group: "verb", name: "present participle", exact: false },
      { value: "Runs", group: "noun", name: "plural", exact: false },
    ],
  },
  {
    id: "e-winterfell",
    headword: "Winterfell",
    lookupValue: null,
    sortKey: "winterfell",
    definitionHtml: '<p>Seat of House Stark. See also <a href="#e0001">Aes Sedai\'s</a>.</p>',
    partOfSpeech: "n.",
    pronunciation: null,
    spoilerAfterBook: 2,
    inflections: [],
  },
];

describe("golden fixture: full dictionary generation", () => {
  it("matches the reviewed snapshot", () => {
    const files = buildDictionaryFiles(series, entries, new Date("2026-08-21"));
    const rendered = files.map((f) => `=== ${f.path} ===\n${f.content}`).join("\n\n");
    expect(rendered).toMatchSnapshot();
  });
});
