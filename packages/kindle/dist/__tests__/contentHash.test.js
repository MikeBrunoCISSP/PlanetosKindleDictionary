import { describe, it, expect } from "vitest";
import { computeContentHash } from "../contentHash.js";
const baseSeries = {
    id: "series-1",
    title: "Test Series",
    author: "An Author",
    description: "A description",
    inLanguage: "en",
    outLanguage: "en",
    books: [
        { ordinal: 1, title: "Book One" },
        { ordinal: 2, title: "Book Two" },
    ],
};
function makeEntry(overrides = {}) {
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
describe("computeContentHash", () => {
    it("is deterministic for identical input", () => {
        const entries = [makeEntry()];
        expect(computeContentHash(baseSeries, entries)).toBe(computeContentHash(baseSeries, entries));
    });
    it("is insensitive to entry array order", () => {
        const a = makeEntry({ id: "a", headword: "Apple", sortKey: "apple" });
        const b = makeEntry({ id: "b", headword: "Banana", sortKey: "banana" });
        expect(computeContentHash(baseSeries, [a, b])).toBe(computeContentHash(baseSeries, [b, a]));
    });
    it("is insensitive to inflection array order", () => {
        const withOrderA = makeEntry({
            inflections: [
                { value: "Wolves", group: null, name: null, exact: false },
                { value: "Wolfish", group: null, name: null, exact: false },
            ],
        });
        const withOrderB = makeEntry({
            inflections: [
                { value: "Wolfish", group: null, name: null, exact: false },
                { value: "Wolves", group: null, name: null, exact: false },
            ],
        });
        expect(computeContentHash(baseSeries, [withOrderA])).toBe(computeContentHash(baseSeries, [withOrderB]));
    });
    it("changes when headword changes", () => {
        const original = computeContentHash(baseSeries, [makeEntry()]);
        const changed = computeContentHash(baseSeries, [makeEntry({ headword: "Wolves" })]);
        expect(original).not.toBe(changed);
    });
    it("changes when definitionHtml changes", () => {
        const original = computeContentHash(baseSeries, [makeEntry()]);
        const changed = computeContentHash(baseSeries, [makeEntry({ definitionHtml: "<p>Different.</p>" })]);
        expect(original).not.toBe(changed);
    });
    it("changes when an inflection is added or removed", () => {
        const original = computeContentHash(baseSeries, [makeEntry()]);
        const changed = computeContentHash(baseSeries, [makeEntry({ inflections: [] })]);
        expect(original).not.toBe(changed);
    });
    it("changes when spoilerAfterBook changes", () => {
        const original = computeContentHash(baseSeries, [makeEntry()]);
        const changed = computeContentHash(baseSeries, [makeEntry({ spoilerAfterBook: 2 })]);
        expect(original).not.toBe(changed);
    });
    it("changes when the series title, inLanguage, outLanguage, or book list changes", () => {
        const entries = [makeEntry()];
        const original = computeContentHash(baseSeries, entries);
        expect(computeContentHash({ ...baseSeries, title: "Different Title" }, entries)).not.toBe(original);
        expect(computeContentHash({ ...baseSeries, inLanguage: "fr" }, entries)).not.toBe(original);
        expect(computeContentHash({ ...baseSeries, outLanguage: "fr" }, entries)).not.toBe(original);
        expect(computeContentHash({ ...baseSeries, books: [{ ordinal: 1, title: "Book One" }] }, entries)).not.toBe(original);
    });
    it("does not change when only the series author or description changes", () => {
        const entries = [makeEntry()];
        const original = computeContentHash(baseSeries, entries);
        const changed = computeContentHash({ ...baseSeries, author: "Someone Else", description: "New desc" }, entries);
        expect(changed).toBe(original);
    });
});
//# sourceMappingURL=contentHash.test.js.map