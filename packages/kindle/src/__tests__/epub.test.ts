import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildDictionaryFiles } from "../epub.js";
import { zipAsEpub, zipAsSourceArchive } from "../zip.js";
import type { SeriesInput, EntryInput } from "../types.js";

const series: SeriesInput = {
  id: "series-1",
  title: "Test Series",
  author: "An Author",
  description: "A test dictionary.",
  inLanguage: "en",
  outLanguage: "en",
  books: [{ ordinal: 1, title: "Book One" }],
};

function makeEntry(overrides: Partial<EntryInput> = {}): EntryInput {
  return {
    id: "entry-1",
    headword: "Wolf",
    lookupValue: null,
    sortKey: "wolf",
    definitionHtml: "<p>A canine.</p>",
    partOfSpeech: "n.",
    pronunciation: null,
    spoilerAfterBook: null,
    inflections: [{ value: "Wolves", group: null, name: null, exact: false }],
    ...overrides,
  };
}

describe("buildDictionaryFiles", () => {
  it("produces mimetype first, an OCF container, an about page, an OPF, and one content file per letter with entries", () => {
    const files = buildDictionaryFiles(series, [
      makeEntry({ id: "1", headword: "Apple", sortKey: "apple" }),
      makeEntry({ id: "2", headword: "Zebra", sortKey: "zebra" }),
    ]);
    expect(files[0]?.path).toBe("mimetype");
    const paths = files.map((f) => f.path);
    expect(paths).toContain("META-INF/container.xml");
    expect(paths).toContain("OEBPS/content.opf");
    expect(paths).toContain("OEBPS/about.xhtml");
    expect(paths).toContain("OEBPS/content-a.xhtml");
    expect(paths).toContain("OEBPS/content-z.xhtml");
    expect(paths).not.toContain("OEBPS/content-b.xhtml");
  });

  it("omits content files for letters with no entries and includes content-other only when needed", () => {
    const files = buildDictionaryFiles(series, [makeEntry({ headword: "3-Eyed Raven", sortKey: "3-eyed raven" })]);
    const paths = files.map((f) => f.path);
    expect(paths).toContain("OEBPS/content-other.xhtml");
    expect(paths).not.toContain("OEBPS/content-a.xhtml");
  });
});

describe("zipAsEpub structural correctness", () => {
  it("produces a real zip with mimetype first and stored uncompressed, verified with the system unzip tools", () => {
    const files = buildDictionaryFiles(series, [makeEntry()], new Date("2026-08-21"));
    const zipped = zipAsEpub(files);

    const dir = mkdtempSync(join(tmpdir(), "kindle-epub-test-"));
    const zipPath = join(dir, "test.epub");
    writeFileSync(zipPath, zipped);

    try {
      const entryOrder = execFileSync("zipinfo", ["-1", zipPath], { encoding: "utf8" }).trim().split("\n");
      expect(entryOrder[0]).toBe("mimetype");

      const mimetypeInfo = execFileSync("unzip", ["-v", zipPath, "mimetype"], { encoding: "utf8" });
      expect(mimetypeInfo).toMatch(/Stored|0%/);

      const mimetypeContent = execFileSync("unzip", ["-p", zipPath, "mimetype"], { encoding: "utf8" });
      expect(mimetypeContent).toBe("application/epub+zip");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws if the first file is not mimetype", () => {
    const files = buildDictionaryFiles(series, [makeEntry()]).slice(1);
    expect(() => zipAsEpub(files)).toThrow();
  });
});

describe("zipAsSourceArchive", () => {
  it("produces a real zip readable by the system unzip tools, containing the same file paths", () => {
    const files = buildDictionaryFiles(series, [makeEntry()], new Date("2026-08-21"));
    const zipped = zipAsSourceArchive(files);

    const dir = mkdtempSync(join(tmpdir(), "kindle-sources-test-"));
    const zipPath = join(dir, "sources.zip");
    writeFileSync(zipPath, zipped);

    try {
      const entryOrder = execFileSync("zipinfo", ["-1", zipPath], { encoding: "utf8" }).trim().split("\n");
      expect(new Set(entryOrder)).toEqual(new Set(files.map((f) => f.path)));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
