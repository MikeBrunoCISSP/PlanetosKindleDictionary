import { describe, it, expect } from "vitest";
import { XMLValidator } from "fast-xml-parser";
import { buildDictionaryFiles } from "../epub.js";
const series = {
    id: "series-1",
    title: "Test Series",
    author: "An Author",
    description: "A test dictionary with <special> & characters.",
    inLanguage: "en",
    outLanguage: "en",
    books: [],
};
function makeEntry(overrides = {}) {
    return {
        id: "entry-1",
        headword: "Wolf & Fox",
        lookupValue: null,
        sortKey: "wolf & fox",
        definitionHtml: '<p>A canine <b>predator</b>. See <a href="#e0001">itself</a>.</p>',
        partOfSpeech: "n.",
        pronunciation: "/wʊlf/",
        spoilerAfterBook: null,
        inflections: [
            { value: "Wolves", group: "noun", name: "plural", exact: false },
            { value: "Wolfish", group: "adjective", name: null, exact: true },
        ],
        ...overrides,
    };
}
function validate(xml, xmlnsPrefixes = []) {
    // fast-xml-parser rejects undeclared-but-unused-namespace-looking prefixes
    // unless namespace processing is left default (it doesn't validate namespaces
    // by construction, only well-formedness) - assert well-formedness only.
    const result = XMLValidator.validate(xml, { allowBooleanAttributes: true });
    if (result !== true) {
        throw new Error(`XML validation failed for content containing prefixes [${xmlnsPrefixes.join(",")}]: ${JSON.stringify(result)}`);
    }
    return result;
}
describe("generated files are well-formed XML", () => {
    it("every content, about, and OPF file parses as valid XML", () => {
        const files = buildDictionaryFiles(series, [makeEntry(), makeEntry({ id: "e2", headword: "Zorse", sortKey: "zorse" })]);
        const xmlFiles = files.filter((f) => f.path !== "mimetype");
        expect(xmlFiles.length).toBeGreaterThan(0);
        for (const file of xmlFiles) {
            expect(() => validate(file.content)).not.toThrow();
        }
    });
    it("declares the idx: and mbp: namespaces on every content document", () => {
        const files = buildDictionaryFiles(series, [makeEntry()]);
        const content = files.find((f) => f.path === "OEBPS/content-w.xhtml");
        expect(content).toBeDefined();
        expect(content.content).toContain("xmlns:idx=");
        expect(content.content).toContain("xmlns:mbp=");
    });
    it("catches malformed markup (regression guard)", () => {
        // Deliberately malformed: an unclosed tag should fail validation,
        // proving this test suite would catch a real generator bug.
        expect(() => validate("<idx:entry><idx:orth>Broken</idx:entry>")).toThrow();
    });
});
//# sourceMappingURL=xmlValidity.test.js.map