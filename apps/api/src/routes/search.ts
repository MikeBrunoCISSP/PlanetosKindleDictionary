import type { FastifyPluginAsync } from "fastify";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { SearchResultItemDto, SearchResultsDto } from "@planetos/shared";
import { definitionExcerpt } from "@planetos/shared/sanitize";
import { SEARCH_RATE_LIMIT } from "../plugins/rateLimit.js";

const PAGE_SIZE = 50;
const MAX_QUERY_WORDS = 10;

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "Search query is required").max(200, "Search query is too long"),
  page: z.coerce.number().int().min(1).default(1),
});

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

type RankedRow = {
  entryId: string;
  headword: string;
  definitionHtml: string;
  seriesId: string;
  seriesSlug: string;
  seriesTitle: string;
  totalCount: number;
};

const searchRoutes: FastifyPluginAsync<{ prisma: PrismaClient }> = async (fastify, opts) => {
  const { prisma } = opts;

  fastify.get("/api/search", { config: SEARCH_RATE_LIMIT }, async (request, reply) => {
    const query = searchQuerySchema.parse(request.query);

    const rawWords = query.q.toLowerCase().split(/\s+/).filter(Boolean);
    const words = Array.from(new Set(rawWords)).slice(0, MAX_QUERY_WORDS);

    const emptyResponse: SearchResultsDto = {
      query: query.q,
      page: query.page,
      limit: PAGE_SIZE,
      totalCount: 0,
      totalPages: 1,
      items: [],
    };

    if (words.length === 0) {
      return reply.status(200).send(emptyResponse);
    }

    const skip = (query.page - 1) * PAGE_SIZE;
    const escapedWords = words.map(escapeLikePattern);
    const wordArray = Prisma.join(
      escapedWords.map((w) => Prisma.sql`${w}`),
      ", "
    );

    const rows = await prisma.$queryRaw<RankedRow[]>`
      WITH matches AS (
        SELECT sw."entryId", MIN(q.idx) AS rank
        FROM "SeriesWord" sw
        JOIN unnest(ARRAY[${wordArray}]::text[]) WITH ORDINALITY AS q(word, idx)
          ON sw."normalizedWord" ILIKE ('%' || q.word || '%') ESCAPE '\\'
        GROUP BY sw."entryId"
      )
      SELECT e.id AS "entryId", e."headword", e."definitionHtml",
             s.id AS "seriesId", s.slug AS "seriesSlug", s.title AS "seriesTitle",
             COUNT(*) OVER()::int AS "totalCount"
      FROM matches m
      JOIN "Entry" e ON e.id = m."entryId"
      JOIN "Series" s ON s.id = e."seriesId"
      WHERE e."status" = 'PUBLISHED' AND e."approvalStatus" = 'APPROVED'
      ORDER BY m.rank ASC, e."sortKey" ASC, e.id ASC
      LIMIT ${PAGE_SIZE} OFFSET ${skip}
    `;

    if (rows.length === 0) {
      return reply.status(200).send(emptyResponse);
    }

    const entryIds = rows.map((r) => r.entryId);
    const inflections = await prisma.inflection.findMany({
      where: { entryId: { in: entryIds } },
      select: { entryId: true, value: true },
    });

    const inflectionsByEntry = new Map<string, { value: string }[]>();
    for (const inflection of inflections) {
      const list = inflectionsByEntry.get(inflection.entryId) ?? [];
      list.push({ value: inflection.value });
      inflectionsByEntry.set(inflection.entryId, list);
    }

    function matchesAnyWord(value: string): boolean {
      const lower = value.toLowerCase();
      return words.some((word) => lower.includes(word));
    }

    const items: SearchResultItemDto[] = rows.map((row) => ({
      entryId: row.entryId,
      headword: row.headword,
      headwordMatched: matchesAnyWord(row.headword),
      definitionExcerpt: definitionExcerpt(row.definitionHtml),
      inflections: (inflectionsByEntry.get(row.entryId) ?? []).map((inflection) => ({
        value: inflection.value,
        matched: matchesAnyWord(inflection.value),
      })),
      seriesId: row.seriesId,
      seriesSlug: row.seriesSlug,
      seriesTitle: row.seriesTitle,
    }));

    const totalCount = rows[0]?.totalCount ?? 0;
    const response: SearchResultsDto = {
      query: query.q,
      page: query.page,
      limit: PAGE_SIZE,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
      items,
    };

    return reply.status(200).send(response);
  });
};

export default searchRoutes;
