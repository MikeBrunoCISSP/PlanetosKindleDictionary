import type { FastifyPluginAsync } from "fastify";
import { PrismaClient } from "@prisma/client";
import {
  importEntriesRequestSchema,
  definitionHtmlSchema,
  singleWordText,
  normalizeWord,
  MAX_IMPORT_ENTRIES,
  IMPORT_RESULT_LIST_CAP,
  type ImportEntriesResultDto,
  type ImportSkippedItemDto,
} from "@planetos/shared";
import { plainTextToSafeHtml, sanitizeDefinitionHtml } from "@planetos/shared/sanitize";
import { makeRequireAdmin } from "../plugins/requireAdmin.js";
import { Errors, isPrismaError } from "../lib/errors.js";
import { markSeriesDirty } from "../lib/dirtySeries.js";

const importHeadwordSchema = singleWordText({ max: 200, minMessage: "Headword is required" });

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
        if (typeof rawValue !== "string") {
          skippedInvalid.push({ headword: rawHeadword, reason: "Definition is not a string." });
          continue;
        }

        const headwordResult = importHeadwordSchema.safeParse(rawHeadword);
        if (!headwordResult.success) {
          skippedInvalid.push({
            headword: rawHeadword,
            reason: headwordResult.error.issues[0]?.message ?? "Invalid headword.",
          });
          continue;
        }
        const headword = headwordResult.data;

        const convertedHtml = sanitizeDefinitionHtml(plainTextToSafeHtml(rawValue));
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

              await tx.seriesWord.create({
                data: { seriesId: series.id, entryId: created.id, normalizedWord: sortKey },
              });

              await tx.revision.create({
                data: {
                  entryId: created.id,
                  authorId: userId,
                  action: "CREATE",
                  snapshot: {
                    headword: created.headword,
                    definitionHtml: created.definitionHtml,
                    inflections: [],
                    approvalStatus: created.approvalStatus,
                  },
                },
              });

              await markSeriesDirty(tx, series.id);
            },
            { isolationLevel: "Serializable" }
          );
          createdHeadwords.push(headword);
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
      };

      return reply.status(200).send(result);
    }
  );
};

export default entryImportsRoutes;
