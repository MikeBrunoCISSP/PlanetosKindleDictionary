import type { FastifyPluginAsync } from "fastify";
import { PrismaClient } from "@prisma/client";
import {
  importEntriesRequestSchema,
  definitionHtmlSchema,
  singleWordText,
  normalizeWord,
  MAX_IMPORT_ENTRIES,
  IMPORT_RESULT_LIST_CAP,
  MAX_INFLECTIONS,
  type ImportEntriesResultDto,
  type ImportSkippedItemDto,
} from "@planetos/shared";
import { plainTextToSafeHtml, sanitizeDefinitionHtml } from "@planetos/shared/sanitize";
import { makeRequireAdmin } from "../plugins/requireAdmin.js";
import { Errors, isPrismaError } from "../lib/errors.js";
import { markSeriesDirty } from "../lib/dirtySeries.js";

const importHeadwordSchema = singleWordText({ max: 200, minMessage: "Headword is required" });
const importInflectionSchema = singleWordText({ max: 200, minMessage: "Inflection cannot be empty" });

// Unlike createEntrySchema's .refine() (which rejects the whole submission
// on a bad/duplicate inflection - see packages/shared/src/entries.ts), import
// cleans the list up instead of failing the row: drop anything that isn't a
// valid single word, matches the row's own headword, or repeats an
// already-kept inflection (case-insensitive, first occurrence wins). This is
// a deliberate divergence from manual entry creation, not drift - see
// design.md Decision 1 (openspec: entries/bulk-import).
function cleanInflections(rawInflections: string[], headword: string): string[] {
  const normalizedHeadword = headword.trim().toLowerCase();
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const value of rawInflections) {
    if (!importInflectionSchema.safeParse(value).success) continue;
    const normalized = value.trim().toLowerCase();
    if (normalized === normalizedHeadword) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    cleaned.push(value);
  }
  return cleaned;
}

// A real glossary file can plausibly exceed Fastify's default 1 MiB body
// limit once JSON-stringified - raised only on this route, not globally.
const IMPORT_BODY_LIMIT = 20 * 1024 * 1024;

const entryImportsRoutes: FastifyPluginAsync<{ prisma: PrismaClient }> = async (fastify, opts) => {
  const { prisma } = opts;
  const requireAdmin = makeRequireAdmin(prisma);

  fastify.post(
    "/api/series/:slug/entries/import",
    { preHandler: requireAdmin, bodyLimit: IMPORT_BODY_LIMIT },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const body = importEntriesRequestSchema.parse(request.body);
      const userId = request.session.userId ?? null;

      const series = await prisma.series.findUnique({ where: { slug }, select: { id: true } });
      if (!series) throw Errors.NOT_FOUND();

      const entries = Object.entries(body.entries);
      const createdHeadwords: string[] = [];
      const skippedDuplicateHeadwords: string[] = [];
      const skippedInvalid: ImportSkippedItemDto[] = [];
      let droppedInflectionCount = 0;

      // Processed one at a time, on purpose - NOT Promise.all. Two reasons:
      //
      // 1. Postgres aborts an ENTIRE transaction on the first errored
      //    statement inside it - every later statement on that transaction
      //    fails until rollback, even unrelated ones. A single transaction
      //    wrapping this whole loop, with a try/catch around each item,
      //    would still lose every create after the first duplicate: the
      //    catch only swallows the JS exception, but the underlying
      //    transaction is already unusable for anything after that point.
      //    Skip-and-continue therefore requires one transaction per item,
      //    not one big one - this is a Postgres constraint, not a style
      //    choice, so don't "simplify" this into a single $transaction.
      // 2. Processing sequentially also gives free in-file duplicate
      //    detection: two keys that normalize to the same word (e.g.
      //    "Abelon" / "abelon") have the second hit the same SeriesWord
      //    unique constraint the first one just committed - no separate
      //    in-memory tracking set needed.
      for (const [rawHeadword, rawValue] of entries) {
        if (rawValue === null || typeof rawValue !== "object" || Array.isArray(rawValue)) {
          skippedInvalid.push({ headword: rawHeadword, reason: "Value is not an object." });
          continue;
        }
        const { Definition: rawDefinition, Inflections: rawInflections } = rawValue as {
          Definition?: unknown;
          Inflections?: unknown;
        };

        if (typeof rawDefinition !== "string") {
          skippedInvalid.push({ headword: rawHeadword, reason: "Definition is not a string." });
          continue;
        }
        if (
          rawInflections !== undefined &&
          (!Array.isArray(rawInflections) || !rawInflections.every((value) => typeof value === "string"))
        ) {
          skippedInvalid.push({ headword: rawHeadword, reason: "Inflections is not an array of strings." });
          continue;
        }
        const rawInflectionStrings = (rawInflections as string[] | undefined) ?? [];

        const headwordResult = importHeadwordSchema.safeParse(rawHeadword);
        if (!headwordResult.success) {
          skippedInvalid.push({
            headword: rawHeadword,
            reason: headwordResult.error.issues[0]?.message ?? "Invalid headword.",
          });
          continue;
        }
        const headword = headwordResult.data;

        const convertedHtml = sanitizeDefinitionHtml(plainTextToSafeHtml(rawDefinition));
        const definitionResult = definitionHtmlSchema.safeParse(convertedHtml);
        if (!definitionResult.success) {
          skippedInvalid.push({
            headword,
            reason: definitionResult.error.issues[0]?.message ?? "Invalid definition.",
          });
          continue;
        }
        const definitionHtml = definitionResult.data;
        const sortKey = normalizeWord(headword);

        const inflections = cleanInflections(rawInflectionStrings, headword);
        // Only counted once the row is confirmed created below - a row
        // skipped entirely (too many inflections, or a P2002 duplicate)
        // never "created and then cleaned" anything, so it must not
        // contribute here (openspec: entries/bulk-import).
        const rowDroppedInflectionCount = rawInflectionStrings.length - inflections.length;

        if (inflections.length > MAX_INFLECTIONS) {
          skippedInvalid.push({
            headword,
            reason: `An entry can have at most ${MAX_INFLECTIONS} inflections.`,
          });
          continue;
        }

        try {
          await prisma.$transaction(
            async (tx) => {
              const created = await tx.entry.create({
                data: {
                  seriesId: series.id,
                  headword,
                  sortKey,
                  definitionHtml,
                  approvalStatus: "APPROVED",
                  submittedById: userId,
                  reviewedById: userId,
                  reviewedAt: new Date(),
                },
              });

              // PERF-003: batched instead of one create() per inflection -
              // matches apps/api/src/routes/entries.ts's exact pattern.
              const inflectionRows =
                inflections.length > 0
                  ? await tx.inflection.createManyAndReturn({
                      data: inflections.map((value) => ({ entryId: created.id, value })),
                    })
                  : [];

              await tx.seriesWord.createMany({
                data: [
                  { seriesId: series.id, entryId: created.id, normalizedWord: sortKey },
                  ...inflectionRows.map((row) => ({
                    seriesId: series.id,
                    entryId: created.id,
                    inflectionId: row.id,
                    normalizedWord: normalizeWord(row.value),
                  })),
                ],
              });

              await tx.revision.create({
                data: {
                  entryId: created.id,
                  authorId: userId,
                  action: "CREATE",
                  snapshot: {
                    headword: created.headword,
                    definitionHtml: created.definitionHtml,
                    inflections,
                    approvalStatus: created.approvalStatus,
                  },
                },
              });

              await markSeriesDirty(tx, series.id);
            },
            { isolationLevel: "Serializable" }
          );
          createdHeadwords.push(headword);
          droppedInflectionCount += rowDroppedInflectionCount;
        } catch (err: unknown) {
          if (isPrismaError(err, "P2002")) {
            skippedDuplicateHeadwords.push(headword);
            continue;
          }
          throw err;
        }
      }

      const truncated =
        createdHeadwords.length > IMPORT_RESULT_LIST_CAP ||
        skippedDuplicateHeadwords.length > IMPORT_RESULT_LIST_CAP ||
        skippedInvalid.length > IMPORT_RESULT_LIST_CAP;

      const result: ImportEntriesResultDto = {
        totalInFile: entries.length,
        createdCount: createdHeadwords.length,
        skippedDuplicateCount: skippedDuplicateHeadwords.length,
        skippedInvalidCount: skippedInvalid.length,
        createdHeadwords: createdHeadwords.slice(0, IMPORT_RESULT_LIST_CAP),
        skippedDuplicateHeadwords: skippedDuplicateHeadwords.slice(0, IMPORT_RESULT_LIST_CAP),
        skippedInvalid: skippedInvalid.slice(0, IMPORT_RESULT_LIST_CAP),
        truncated,
        droppedInflectionCount,
      };

      return reply.status(200).send(result);
    }
  );
};

export default entryImportsRoutes;
