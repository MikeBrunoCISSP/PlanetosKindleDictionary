## Context

See proposal.md - Why. Confirmed by reading the code at all four cited locations:

- `apps/api/src/routes/admin.ts` `GET /api/admin/users/pending` (line 85): `prisma.user.findMany({ where: { approvalStatus: "PENDING" }, orderBy: { createdAt: "asc" } })` — no `skip`/`take`. Its sibling `GET /api/admin/users` already has a `page`/`limit` zod schema (default 50, max 200) and an offset query. `User` has no index on `approvalStatus`.
- `apps/api/src/routes/entryEditProposals.ts` `GET /api/admin/review-queue` (line 222): two unbounded `findMany` calls (`Entry` where `approvalStatus: PENDING`, no `orderBy`; `EntryEditProposal` where `status: PENDING`) merged and sorted by `createdAt` in Node. `EntryEditProposal` already has `@@index([status, createdAt])`; `Entry` has no index touching `approvalStatus`.
- `apps/api/src/routes/downloads.ts` `GET /api/series/:slug/builds` (line 111): fully public (no `preHandler`), unbounded `findMany` ordered `createdAt desc`. Zero consumers in `apps/web` (grepped). `Build` already has `@@index([seriesId, createdAt])` and `@@index([seriesId, status, createdAt])`.
- `apps/api/src/jobs/prune.ts` `pruneOldBuilds` (line 19): invoked once per `seriesId` (via `worker.ts`'s `maintenanceQueue.add("prune-series", { seriesId })` after every successful build). Loads every `SUCCESS` build the series has ever had (`Build` rows are never deleted, only `epubKey`/`sourceKey` nulled), then `.slice(RETENTION_COUNT)` in memory.

**Why cursor pagination specifically for the two moderation-queue endpoints, not the existing offset `page`/`limit` convention** (already used by `/api/admin/users`, `/api/series`, `/api/search`): these two lists are actively depleted by the same admin paging through them — approving/rejecting an item removes it from the `WHERE ... = PENDING` set mid-browse. Offset pagination's `skip=N` then lands on the wrong row once earlier rows have been removed (a row shifts from position 51 to 50, so `skip=50` on the next page either skips or repeats it). A cursor keyed on `(createdAt, id)` — "give me items strictly after this exact position" — has no such dependency on how many rows currently precede it. SPEC.md documents "cursor-based on `(sortKey, id)`" as the project's pagination convention, but nothing in the codebase actually implements cursor pagination yet (confirmed by grep) — this is the first real implementation, using `(createdAt, id)` rather than `sortKey` since these lists sort by submission time, not alphabetically.

`GET /api/series/:slug/builds` has no such depletion-during-paging concern (nothing removes rows from it while it's being read) and has zero current consumers, so it gets a fixed cap instead of new pagination API surface.

## Goals / Non-Goals

**Goals:**
- Every externally returned collection at the four cited locations has a server-enforced maximum page size.
- The two moderation queues remain correctly, stably orderable across pages even while admins are actively approving/rejecting/denying items from them.
- Pruning's memory use stops scaling with a series' total historical build count.

**Non-Goals:**
- Changing what counts as "pending," what fields are shown, or any approve/reject/deny business logic — only how these collections are queried and paged.
- Changing the retention count (10 most recent builds) or any externally observable pruning outcome — only the internal query shape.
- Retrofitting `GET /api/admin/entries/pending` (`entries.ts`) — an independently-called route with the identical unbounded shape as this change's `Entry`-side review-queue query, but not named in the finding's `locations`. The new `Entry.approvalStatus, createdAt` index benefits it for free; its query itself is a documented gap for a future fix, not touched here.
- Introducing a generic, fully-abstracted pagination framework — just the two concrete cursor-paginated endpoints plus one small reusable envelope/cursor helper, sized to what these two endpoints actually need.

## Decisions

### 1. A shared opaque cursor helper, `apps/api/src/lib/cursor.ts`

```ts
export interface ListCursor {
  createdAt: string; // ISO datetime
  id: string;
}

export function encodeCursor(cursor: ListCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): ListCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw Errors.INVALID_CURSOR();
  }
  if (
    typeof parsed !== "object" || parsed === null ||
    typeof (parsed as ListCursor).createdAt !== "string" ||
    typeof (parsed as ListCursor).id !== "string"
  ) {
    throw Errors.INVALID_CURSOR();
  }
  return parsed as ListCursor;
}
```

(`Errors.INVALID_CURSOR` follows the existing `apps/api/src/lib/errors.ts` catalog pattern - a `400` RFC 9457 problem response, added alongside the existing error constructors.) A malformed/tampered cursor is a client error, not a 500 - the route calls `decodeCursor` inside its own try/catch scope the same way existing routes already handle client-supplied malformed input.

Opaque rather than two plain query params (`cursorCreatedAt`/`cursorId`) so the client only ever needs to echo back what the server gave it, not understand or reconstruct the tuple - standard cursor-pagination ergonomics, and it keeps the internal cursor shape free to evolve without a client-facing contract change.

### 2. `GET /api/admin/users/pending` becomes cursor-paginated

```ts
const pendingUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

fastify.get("/api/admin/users/pending", { preHandler: requireAdmin }, async (request, reply) => {
  const query = pendingUsersQuerySchema.parse(request.query);
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;

  const users = await prisma.user.findMany({
    where: {
      approvalStatus: "PENDING",
      ...(cursor
        ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] }
        : {}),
    },
    select: { id: true, username: true, email: true, reasonForJoining: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: query.limit,
  });

  const last = users.at(-1);
  const nextCursor =
    users.length === query.limit && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;

  return reply.status(200).send({ items: users.map(toPendingUserDto), nextCursor });
});
```

`nextCursor` is set only when the page came back full (`users.length === query.limit`) - a partial page proves the source is exhausted, so there is nothing to gain from one more round-trip that would return empty.

### 3. `GET /api/admin/review-queue` becomes bounded, cursor-paginated over the merge

```ts
const reviewQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

fastify.get("/api/admin/review-queue", { preHandler: requireAdmin }, async (request, reply) => {
  const query = reviewQueueQuerySchema.parse(request.query);
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  const cursorWhere = cursor
    ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] }
    : {};

  const [pendingEntries, pendingProposals] = await Promise.all([
    prisma.entry.findMany({
      where: { approvalStatus: "PENDING", ...cursorWhere },
      select: { id: true, headword: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: query.limit,
    }),
    prisma.entryEditProposal.findMany({
      where: { status: "PENDING", ...cursorWhere },
      select: { id: true, entryId: true, createdAt: true, entry: { select: { headword: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: query.limit,
    }),
  ]);

  const merged: PendingQueueItemDto[] = [
    ...pendingEntries.map((entry) => ({
      type: "NEW_ENTRY" as const,
      id: entry.id,
      headword: entry.headword,
      createdAt: entry.createdAt.toISOString(),
    })),
    ...pendingProposals.map((proposal) => ({
      type: "EDIT" as const,
      id: proposal.id,
      entryId: proposal.entryId,
      headword: proposal.entry.headword,
      createdAt: proposal.createdAt.toISOString(),
    })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  const items = merged.slice(0, query.limit);
  // Either source individually coming back full means it may have more
  // beyond what was fetched, even if the merged+sliced page doesn't need
  // all of it - err toward assuming more exists rather than silently
  // truncating a real remainder.
  const mayHaveMore = merged.length > query.limit || pendingEntries.length === query.limit || pendingProposals.length === query.limit;
  const lastItem = items.at(-1);
  const nextCursor = mayHaveMore && lastItem ? encodeCursor({ createdAt: lastItem.createdAt, id: lastItem.id }) : null;

  return reply.status(200).send({ items, nextCursor });
});
```

Each source is fetched with its own `take: query.limit` - never more than one page's worth from either table regardless of total pending count - then merge-sorted and re-sliced to exactly `query.limit`. This is what "query the merged review queue in a bounded form" means concretely.

### 4. A shared paginated-envelope schema in `packages/shared`

```ts
export function pagedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
  });
}

export const pendingUsersPageDtoSchema = pagedSchema(pendingUserDtoSchema);
export type PendingUsersPageDto = z.infer<typeof pendingUsersPageDtoSchema>;

export const reviewQueuePageDtoSchema = pagedSchema(pendingQueueItemDtoSchema);
export type ReviewQueuePageDto = z.infer<typeof reviewQueuePageDtoSchema>;
```

One small factory reused by both endpoints rather than two near-identical hand-rolled envelope types - the only new abstraction this change introduces, and it's sized to exactly the two call sites that need it today.

### 5. Frontend: `useInfiniteQuery` + "Load more" for both admin tables

`apps/web/src/lib/api.ts`:

```ts
export async function apiGetPendingUsers(params: { limit?: number; cursor?: string } = {}): Promise<PendingUsersPageDto> {
  const qs = new URLSearchParams();
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.cursor) qs.set("cursor", params.cursor);
  const res = await fetch(`/api/admin/users/pending?${qs}`, { credentials: "include" });
  return handleResponse<PendingUsersPageDto>(res);
}
```
(and the equivalent for `apiGetReviewQueue`.)

`PendingRegistrationsTable`/`ApprovalQueueTable`:

```ts
const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
  queryKey: ["admin", "users", "pending"],
  queryFn: ({ pageParam }) => apiGetPendingUsers({ cursor: pageParam }),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
});
const pendingUsers = data?.pages.flatMap((page) => page.items) ?? [];
```

A "Load more" button (disabled while `isFetchingNextPage`, hidden when `!hasNextPage`) below the table, matching this codebase's existing plain-button UI style rather than infinite-scroll. Existing behavior - column set, modals, optimistic-removal-only-after-server-confirmation, `queryClient.invalidateQueries` after each approve/reject/deny mutation - is unchanged; invalidating an infinite query re-fetches from the first page onward, which is the correct behavior here (an approved/denied/rejected item should disappear from whatever page it was on).

### 6. `GET /api/series/:slug/builds` gets a fixed cap, no new API surface

```ts
const MAX_BUILD_HISTORY = 50;
// ...
const builds = await prisma.build.findMany({
  where: { seriesId: series.id },
  orderBy: { createdAt: "desc" },
  take: MAX_BUILD_HISTORY,
  select: { id: true, status: true, createdAt: true, entryCount: true },
});
```

No query params, no envelope change - still a bare array, matching today's response shape exactly (a smaller array for a series with more than 50 builds; identical shape/behavior otherwise). No frontend change needed (zero consumers today, confirmed by grep).

### 7. `pruneOldBuilds` becomes self-limiting

```ts
const RETENTION_COUNT = 10;
const PRUNE_BATCH_LIMIT = 500;

export async function pruneOldBuilds(prisma: PrismaClient, storage: PruneStorage, seriesId: string): Promise<void> {
  const toPrune = await prisma.build.findMany({
    where: {
      seriesId,
      status: "SUCCESS",
      OR: [{ epubKey: { not: null } }, { sourceKey: { not: null } }],
    },
    orderBy: { createdAt: "desc" },
    skip: RETENTION_COUNT,
    take: PRUNE_BATCH_LIMIT,
    select: { id: true, epubKey: true, sourceKey: true },
  });
  if (toPrune.length === 0) return;
  // ...unchanged deleteObjects + updateMany...
}
```

The `OR` clause is the actual fix: once a row is pruned (both keys nulled), it never matches this query again, so each invocation's result set is only the delta since the last successful run - in steady state (this job runs once per successful build) that's typically 0-1 rows, not the series' entire history. `PRUNE_BATCH_LIMIT` is a hard safety valve for a pathological backlog (e.g. the job broken for a long time): even then, memory use per invocation is capped at 500 rows' worth of lean `{id, epubKey, sourceKey}` data, and a backlog beyond that self-heals over subsequent invocations. No index change needed - the existing `@@index([seriesId, status, createdAt])` already covers this exact query shape (`skip`/`take` apply cheaply on top of an index-ordered scan).

### 8. New indexes

```prisma
model User {
  // ...
  @@index([approvalStatus, createdAt])
}

model Entry {
  // ...
  @@index([approvalStatus, createdAt])
}
```

Both are purely additive. The `User` index backs both `GET /api/admin/users/pending` (this change) and the existing `GET /api/admin/users`. The `Entry` index backs the review queue's `Entry`-side query (this change) and, incidentally, the not-in-scope `GET /api/admin/entries/pending` sibling.

## Risks / Trade-offs

- **[Risk] The review queue's "fetch `limit` from each source, merge, re-slice" approach can under-fill a page** (e.g. if `Entry` has 0 pending but `EntryEditProposal` has 200, a `limit: 50` page returns 50 `EDIT` items correctly, but if `Entry` has 30 and `EntryEditProposal` has 30, a page returns all 30+30=60 merged then sliced to 50 - fine) **but never over-reads**: each source query is capped at `limit`, so worst case this call touches `2 × limit` rows total, still O(page size), not O(total pending) - the actual proportionality goal. → No mitigation needed; this is bounded by design, not a bug.
- **[Risk] `nextCursor`'s "assume more" heuristic can occasionally return an empty next page** (a wasted round-trip when both sources' `take: limit` fetches happened to exactly reach their true end). → Accepted trade-off, stated explicitly in Decision 3: erring toward a spurious "Load more" that returns nothing is strictly safer than erring toward silently truncating a real remainder.
- **[Risk] Existing tests directly asserting `apps/api/tests/downloads.test.ts`'s and `apps/api/tests/prune.test.ts`'s current bare-array/full-history-returned behavior may need updating for the new cap/filter.** → Addressed in tasks.md; existing fixtures in both files create well under the new caps (confirmed during exploration), so this is expected to be a small, mechanical update, not a rewrite.

## Migration Plan

Purely additive: two new composite indexes, no column/table changes, no data backfill. `GET /api/admin/users/pending` and `GET /api/admin/review-queue` change response shape (bare array → `{ items, nextCursor }` envelope) - this is a breaking change to those two response bodies, but both current consumers (the two admin tables in `apps/web`) are updated in the same change, and no other consumer of either endpoint exists (both are admin-only, not part of any public/documented external API). `GET /api/series/:slug/builds` keeps its exact response shape (still a bare array), only returning fewer rows for a series with more than 50 builds - no consumer exists to break. No rollback concerns beyond the standard additive-migration case.
