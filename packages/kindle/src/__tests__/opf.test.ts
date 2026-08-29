import { describe, it, expect } from "vitest";
import { buildOpf } from "../opf.js";
import type { SeriesInput } from "../types.js";

const series: SeriesInput = {
  id: "series-1",
  title: "The Wheel of Time",
  author: "Robert Jordan",
  description: "A description",
  inLanguage: "en",
  outLanguage: "en-us",
  books: [],
};

describe("buildOpf", () => {
  it("maps DictionaryInLanguage/DictionaryOutLanguage from the series and sets DefaultLookupIndex to 'series'", () => {
    const opf = buildOpf(series, [], "00000000-0000-0000-0000-000000000000", new Date("2026-08-21"));
    expect(opf).toContain("<DictionaryInLanguage>en</DictionaryInLanguage>");
    expect(opf).toContain("<DictionaryOutLanguage>en-us</DictionaryOutLanguage>");
    expect(opf).toContain("<DefaultLookupIndex>series</DefaultLookupIndex>");
  });

  it("uses the given uuid as the dc:identifier", () => {
    const opf = buildOpf(series, [], "11111111-1111-1111-1111-111111111111", new Date("2026-08-21"));
    expect(opf).toContain("<dc:identifier id=\"uid\">urn:uuid:11111111-1111-1111-1111-111111111111</dc:identifier>");
  });

  it("lists manifest items and spine itemrefs for every given file, in order", () => {
    const opf = buildOpf(
      series,
      [
        { id: "about", path: "about.xhtml" },
        { id: "content-a", path: "content-a.xhtml" },
      ],
      "00000000-0000-0000-0000-000000000000",
      new Date("2026-08-21")
    );
    const manifestIndex = opf.indexOf('<item id="about" href="about.xhtml"');
    const contentIndex = opf.indexOf('<item id="content-a" href="content-a.xhtml"');
    expect(manifestIndex).toBeGreaterThan(-1);
    expect(contentIndex).toBeGreaterThan(manifestIndex);
    expect(opf).toContain('<itemref idref="about"/>');
    expect(opf).toContain('<itemref idref="content-a"/>');
  });

  it("escapes special characters in the series title", () => {
    const opf = buildOpf(
      { ...series, title: "A & B" },
      [],
      "00000000-0000-0000-0000-000000000000",
      new Date("2026-08-21")
    );
    expect(opf).toContain("A &amp; B");
  });
});
