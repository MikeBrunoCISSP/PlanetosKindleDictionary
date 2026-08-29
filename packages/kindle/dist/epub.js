import { assignPlacements, groupByLetter, renderContentFile, escapeXmlText } from "./xhtml.js";
import { buildOpf } from "./opf.js";
import { deriveDictionaryUuid } from "./identifier.js";
const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;
function renderAbout(series) {
    const description = series.description ? `<p>${escapeXmlText(series.description)}</p>\n  ` : "";
    return `<html xmlns="http://www.w3.org/1999/xhtml">
  <head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/></head>
  <body>
    <h1>${escapeXmlText(series.title)}</h1>
    ${description}
  </body>
</html>
`;
}
const LETTER_ORDER = "abcdefghijklmnopqrstuvwxyz".split("");
/**
 * Assembles the full in-memory file list for a series' Kindle dictionary:
 * mimetype, OCF container, about page, one content document per letter
 * that has entries, and the OPF (SPEC.md §5). `buildDate` is injected for
 * deterministic tests; production callers pass `new Date()`.
 */
export function buildDictionaryFiles(series, entries, buildDate = new Date()) {
    const placements = assignPlacements(entries);
    const byId = new Map(placements.map((p) => [p.id, p]));
    const grouped = groupByLetter(placements);
    const contentFiles = [];
    for (const letter of LETTER_ORDER) {
        const group = grouped.get(letter);
        if (group && group.length > 0) {
            contentFiles.push({ letter, content: renderContentFile(group, byId) });
        }
    }
    const otherGroup = grouped.get("other");
    if (otherGroup && otherGroup.length > 0) {
        contentFiles.push({ letter: "other", content: renderContentFile(otherGroup, byId) });
    }
    const opfItems = [
        { id: "about", path: "about.xhtml" },
        ...contentFiles.map((file) => ({ id: `content-${file.letter}`, path: `content-${file.letter}.xhtml` })),
    ];
    const uuid = deriveDictionaryUuid(series.id);
    const opf = buildOpf(series, opfItems, uuid, buildDate);
    const files = [
        { path: "mimetype", content: "application/epub+zip" },
        { path: "META-INF/container.xml", content: CONTAINER_XML },
        { path: "OEBPS/content.opf", content: opf },
        { path: "OEBPS/about.xhtml", content: renderAbout(series) },
        ...contentFiles.map((file) => ({ path: `OEBPS/content-${file.letter}.xhtml`, content: file.content })),
    ];
    return files;
}
//# sourceMappingURL=epub.js.map