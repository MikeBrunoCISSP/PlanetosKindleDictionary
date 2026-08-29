import { describe, it, expect } from "vitest";
import { assignPlacements, groupByLetter, renderContentFile } from "../xhtml.js";
import type { EntryInput } from "../types.js";

function makeEntry(overrides: Partial<EntryInput> = {}): EntryInput {
  return {
    id: "id-1",
    headword: "Wolf",
    lookupValue: null,
    sortKey: "wolf",
    definitionHtml: "<p>A canine.</p>",
    partOfSpeech: null,
    pronunciation: null,
    spoilerAfterBook: null,
    inflections: [],
    ...overrides,
  };
}

describe("assignPlacements", () => {
  it("assigns sequential ids in sortKey order regardless of input order", () => {
    const banana = makeEntry({ id: "b", headword: "Banana", sortKey: "banana" });
    const apple = makeEntry({ id: "a", headword: "Apple", sortKey: "apple" });
    const placements = assignPlacements([banana, apple]);
    expect(placements.map((p) => p.entry.headword)).toEqual(["Apple", "Banana"]);
    expect(placements.map((p) => p.id)).toEqual(["e0001", "e0002"]);
  });

  it("buckets by lowercase first letter, and non-alphabetic headwords into 'other'", () => {
    const placements = assignPlacements([
      makeEntry({ headword: "Aes Sedai", sortKey: "aes sedai" }),
      makeEntry({ headword: "Zorro", sortKey: "zorro" }),
      makeEntry({ headword: "3-Eyed Raven", sortKey: "3-eyed raven" }),
    ]);
    const letters = placements.map((p) => p.letter);
    // sortKey order, not headword order: "3-eyed raven" < "aes sedai" < "zorro"
    expect(letters).toEqual(["other", "a", "z"]);
  });
});

describe("groupByLetter", () => {
  it("groups placements by letter, preserving order within each group", () => {
    const placements = assignPlacements([
      makeEntry({ id: "1", headword: "Apple", sortKey: "apple" }),
      makeEntry({ id: "2", headword: "Ant", sortKey: "ant" }),
      makeEntry({ id: "3", headword: "Banana", sortKey: "banana" }),
    ]);
    const groups = groupByLetter(placements);
    expect([...groups.keys()]).toEqual(["a", "b"]);
    expect(groups.get("a")?.map((p) => p.entry.headword)).toEqual(["Ant", "Apple"]);
  });
});

describe("renderEntry markup rules (via renderContentFile)", () => {
  it("includes name=series, scriptable=yes, spell=yes, and the assigned id", () => {
    const placements = assignPlacements([makeEntry()]);
    const byId = new Map(placements.map((p) => [p.id, p]));
    const xhtml = renderContentFile(placements, byId);
    expect(xhtml).toContain('<idx:entry name="series" scriptable="yes" spell="yes" id="e0001">');
  });

  it("bolds the headword and omits idx:orth value when the headword is plain alphanumeric", () => {
    const placements = assignPlacements([makeEntry({ headword: "Wolf" })]);
    const byId = new Map(placements.map((p) => [p.id, p]));
    const xhtml = renderContentFile(placements, byId);
    expect(xhtml).toContain("<idx:orth>");
    expect(xhtml).toContain("<b>Wolf</b>");
  });

  it("emits idx:orth value from lookupValue when set", () => {
    const placements = assignPlacements([makeEntry({ headword: "Amazon³", lookupValue: "Amazon" })]);
    const byId = new Map(placements.map((p) => [p.id, p]));
    const xhtml = renderContentFile(placements, byId);
    expect(xhtml).toContain('<idx:orth value="Amazon">');
  });

  it("emits idx:orth value from the headword itself when it contains punctuation, with no explicit lookupValue", () => {
    const placements = assignPlacements([makeEntry({ headword: "Aes Sedai's" })]);
    const byId = new Map(placements.map((p) => [p.id, p]));
    const xhtml = renderContentFile(placements, byId);
    expect(xhtml).toContain(`<idx:orth value="Aes Sedai's">`);
  });

  it("nests idx:infl inside idx:orth with iform value/name/exact only when set", () => {
    const placements = assignPlacements([
      makeEntry({
        inflections: [
          { value: "Wolves", group: null, name: null, exact: false },
          { value: "Wolfish", group: "adjective", name: "adjective form", exact: true },
        ],
      }),
    ]);
    const byId = new Map(placements.map((p) => [p.id, p]));
    const xhtml = renderContentFile(placements, byId);
    expect(xhtml).toContain('<idx:iform value="Wolves" />');
    expect(xhtml).toContain('<idx:infl inflgrp="adjective">');
    expect(xhtml).toContain('<idx:iform value="Wolfish" name="adjective form" exact="yes" />');
  });

  it("renders partOfSpeech and pronunciation without adding extra punctuation", () => {
    const placements = assignPlacements([makeEntry({ partOfSpeech: "n.", pronunciation: "/wʊlf/" })]);
    const byId = new Map(placements.map((p) => [p.id, p]));
    const xhtml = renderContentFile(placements, byId);
    expect(xhtml).toContain("<p><i>n.</i> /wʊlf/</p>");
    expect(xhtml).not.toContain("n..");
  });

  it("places an hr between entries and none of the idx:key deprecated tag anywhere", () => {
    const placements = assignPlacements([
      makeEntry({ id: "1", headword: "Apple", sortKey: "apple" }),
      makeEntry({ id: "2", headword: "Banana", sortKey: "banana" }),
    ]);
    const byId = new Map(placements.map((p) => [p.id, p]));
    const xhtml = renderContentFile(placements, byId);
    expect(xhtml).toContain("<hr/>");
    expect(xhtml).not.toContain("idx:key");
  });

  it("rewrites a cross-reference href to the target entry's own letter file", () => {
    const target = makeEntry({ id: "target", headword: "Winterfell", sortKey: "winterfell" });
    const referrer = makeEntry({
      id: "referrer",
      headword: "Aegon",
      sortKey: "aegon",
      definitionHtml: '<p>See <a href="#e0002">Winterfell</a>.</p>',
    });
    const placements = assignPlacements([referrer, target]);
    const byId = new Map(placements.map((p) => [p.id, p]));
    const winterfellId = placements.find((p) => p.entry.headword === "Winterfell")!.id;
    const xhtml = renderContentFile(placements, byId);
    expect(xhtml).toContain(`href="content-w.xhtml#${winterfellId}"`);
  });

  it("leaves a dangling cross-reference href untouched rather than throwing", () => {
    const referrer = makeEntry({ definitionHtml: '<p>See <a href="#e9999">Ghost</a>.</p>' });
    const placements = assignPlacements([referrer]);
    const byId = new Map(placements.map((p) => [p.id, p]));
    expect(() => renderContentFile(placements, byId)).not.toThrow();
    const xhtml = renderContentFile(placements, byId);
    expect(xhtml).toContain('href="#e9999"');
  });

  it("wraps mbp:frameset as the first child of body", () => {
    const placements = assignPlacements([makeEntry()]);
    const byId = new Map(placements.map((p) => [p.id, p]));
    const xhtml = renderContentFile(placements, byId);
    const bodyIndex = xhtml.indexOf("<body>");
    const framesetIndex = xhtml.indexOf("<mbp:frameset>");
    expect(framesetIndex).toBeGreaterThan(bodyIndex);
    expect(xhtml.slice(bodyIndex + "<body>".length, framesetIndex)).not.toMatch(/<\w/);
  });
});
