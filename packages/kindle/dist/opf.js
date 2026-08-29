import { escapeXmlText } from "./xhtml.js";
const CREATOR = "Kindle Series Dictionaries contributors";
/** Builds the dictionary OPF per SPEC.md §5.5. `items` must already be in spine order. */
export function buildOpf(series, items, uuid, buildDate) {
    const manifest = items
        .map((item) => `    <item id="${item.id}" href="${item.path}" media-type="application/xhtml+xml"/>`)
        .join("\n");
    const spine = items.map((item) => `    <itemref idref="${item.id}"/>`).join("\n");
    const dateString = buildDate.toISOString().slice(0, 10);
    return `<?xml version="1.0" encoding="utf-8"?>
<package version="2.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${escapeXmlText(series.title)} — Series Dictionary</dc:title>
    <dc:creator opf:role="aut">${escapeXmlText(CREATOR)}</dc:creator>
    <dc:language>${escapeXmlText(series.outLanguage)}</dc:language>
    <dc:identifier id="uid">urn:uuid:${uuid}</dc:identifier>
    <dc:date>${dateString}</dc:date>
    <x-metadata>
      <DictionaryInLanguage>${escapeXmlText(series.inLanguage)}</DictionaryInLanguage>
      <DictionaryOutLanguage>${escapeXmlText(series.outLanguage)}</DictionaryOutLanguage>
      <DefaultLookupIndex>series</DefaultLookupIndex>
    </x-metadata>
  </metadata>
  <manifest>
${manifest}
  </manifest>
  <spine>
${spine}
  </spine>
</package>
`;
}
//# sourceMappingURL=opf.js.map