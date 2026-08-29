import type { EntryInput, InflectionInput } from "./types.js";

export interface EntryPlacement {
  id: string;
  letter: string;
  entry: EntryInput;
}

const OTHER_LETTER = "other";
const CROSS_REF_PATTERN = /href="#(e\d+)"/g;

function letterFor(headword: string): string {
  const first = headword.trim().charAt(0).toLowerCase();
  return /^[a-z]$/.test(first) ? first : OTHER_LETTER;
}

/**
 * Assigns every entry a stable, sequential, deterministic id (SPEC.md §5.3)
 * and its destination per-letter content file, in sortKey order. This is
 * pass one of the two-pass build - pass two (renderContentFile) uses the
 * resulting id->placement map to rewrite cross-reference hrefs to their
 * correct target file.
 */
export function assignPlacements(entries: EntryInput[]): EntryPlacement[] {
  const sorted = [...entries].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const width = Math.max(4, String(sorted.length).length);
  return sorted.map((entry, index) => ({
    id: `e${String(index + 1).padStart(width, "0")}`,
    letter: letterFor(entry.headword),
    entry,
  }));
}

/** Groups placements by their destination letter, preserving sortKey order within each letter. */
export function groupByLetter(placements: EntryPlacement[]): Map<string, EntryPlacement[]> {
  const groups = new Map<string, EntryPlacement[]>();
  for (const placement of placements) {
    const existing = groups.get(placement.letter);
    if (existing) {
      existing.push(placement);
    } else {
      groups.set(placement.letter, [placement]);
    }
  }
  return groups;
}

export function escapeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeXmlAttr(value: string): string {
  return escapeXmlText(value).replace(/"/g, "&quot;");
}

function needsLookupValue(entry: EntryInput): boolean {
  if (entry.lookupValue) return true;
  return /[^A-Za-z0-9 ]/.test(entry.headword);
}

function renderInflections(inflections: InflectionInput[]): string {
  if (inflections.length === 0) return "";

  const groups = new Map<string | null, InflectionInput[]>();
  for (const inflection of inflections) {
    const existing = groups.get(inflection.group);
    if (existing) {
      existing.push(inflection);
    } else {
      groups.set(inflection.group, [inflection]);
    }
  }

  const blocks: string[] = [];
  for (const [group, forms] of groups) {
    const inflgrpAttr = group ? ` inflgrp="${escapeXmlAttr(group)}"` : "";
    const iforms = forms
      .map((form) => {
        const nameAttr = form.name ? ` name="${escapeXmlAttr(form.name)}"` : "";
        const exactAttr = form.exact ? ` exact="yes"` : "";
        return `      <idx:iform value="${escapeXmlAttr(form.value)}"${nameAttr}${exactAttr} />`;
      })
      .join("\n");
    blocks.push(`    <idx:infl${inflgrpAttr}>\n${iforms}\n    </idx:infl>`);
  }

  return "\n" + blocks.join("\n");
}

function rewriteCrossReferences(html: string, byId: Map<string, EntryPlacement>): string {
  return html.replace(CROSS_REF_PATTERN, (match, targetId: string) => {
    const target = byId.get(targetId);
    if (!target) return match;
    return `href="content-${target.letter}.xhtml#${targetId}"`;
  });
}

function renderEntry(placement: EntryPlacement, byId: Map<string, EntryPlacement>): string {
  const { id, entry } = placement;
  const valueAttr = needsLookupValue(entry)
    ? ` value="${escapeXmlAttr(entry.lookupValue ?? entry.headword)}"`
    : "";

  const metaParts: string[] = [];
  if (entry.partOfSpeech) metaParts.push(`<i>${escapeXmlText(entry.partOfSpeech)}</i>`);
  if (entry.pronunciation) metaParts.push(escapeXmlText(entry.pronunciation));
  const metaLine = metaParts.length > 0 ? `<p>${metaParts.join(" ")}</p>\n  ` : "";

  const definition = rewriteCrossReferences(entry.definitionHtml, byId);

  return [
    `<idx:entry name="series" scriptable="yes" spell="yes" id="${id}">`,
    `  <idx:orth${valueAttr}>`,
    `    <b>${escapeXmlText(entry.headword)}</b>${renderInflections(entry.inflections)}`,
    `  </idx:orth>`,
    `  ${metaLine}${definition}`,
    `</idx:entry>`,
    `<hr/>`,
  ].join("\n");
}

/** Renders one per-letter content document (SPEC.md §5.2 skeleton + §5.3 entries). */
export function renderContentFile(placements: EntryPlacement[], byId: Map<string, EntryPlacement>): string {
  const entries = placements.map((placement) => renderEntry(placement, byId)).join("\n");

  return `<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:idx="https://kindlegen.s3.amazonaws.com/AmazonKindlePublishingGuidelines.pdf"
      xmlns:mbp="https://kindlegen.s3.amazonaws.com/AmazonKindlePublishingGuidelines.pdf">
  <head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/></head>
  <body>
    <mbp:frameset>
${entries}
    </mbp:frameset>
  </body>
</html>
`;
}
