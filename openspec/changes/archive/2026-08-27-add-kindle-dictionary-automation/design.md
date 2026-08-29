## Context

See proposal.md - Why. `SPEC.md` §5 (Kindle dictionary format) and §7 (Background jobs) are the authoritative design references for the file format and job architecture respectively — this document covers implementation-level decisions SPEC leaves open (process topology, storage client shape, retention mechanics) and records the scope boundaries already confirmed with the user before this change was written: hourly *change-detection* (not unconditional) rebuilds, a minimal frontend (no live status polling), and no automated `.mobi` conversion.

Nothing this change touches exists in code today: no `packages/kindle`, no job queue library, no object-storage client, no download routes, no series detail page. The `Build` Prisma model, `BuildStatus` enum, and `Series.contentHash` field already exist and already match the design — no schema changes needed for those.

## Goals / Non-Goals

**Goals:**
- Every dictionary's EPUB is generated automatically and kept up to date within an hour of a content change, without manual intervention.
- Anyone can download the current EPUB and sources for any built dictionary without an account.
- A failed build never takes a working dictionary offline.
- The same code works against local MinIO and real cloud object storage without branching.

**Non-Goals:**
- Automated `.mobi`/`.azw` conversion (kindlegen requires the Kindle Previewer GUI app; stays a manual, documented step).
- A live-updating build-status UI (badge, polling) on the series page — a 404 before the first build and static download links afterward is sufficient for this change.
- IAM-role-based cloud credentials — plain env-var credentials, consistent with every other credential in this app.
- Splitting a single letter's entries across multiple content files for extremely large dictionaries — noted as a future concern, not built now.

## Decisions

**1. `packages/kindle` is a new workspace package, not an `apps/api/src/lib/` module.**
It's pure input→file-list functions with no Fastify/Prisma dependency, matching `packages/shared`'s shape exactly (own `package.json`, own `vitest` suite). SPEC.md already names it this in two places. Keeping it a package (not inline in `apps/api`) makes its golden-file-style tests naturally isolated and keeps Prisma-shaped types out of the generator entirely — `apps/api` maps Prisma rows into plain `SeriesInput`/`EntryInput`/`InflectionInput` types before calling in, so the generator and the content-hash function are guaranteed to operate on identical data.

**2. Zip library: `fflate`.**
Zero dependencies, synchronous in-memory `zipSync` API (the whole EPUB is built in memory at this app's scale — no streaming needed), and its per-file options object supports `level: 0` for the one entry (`mimetype`) that the EPUB OCF spec requires to be stored uncompressed and first. Alternative considered: `yazl` (explicit per-`addBuffer` compress flag, call-order-is-file-order) — a reasonable fallback if `fflate`'s ordering/store behavior doesn't hold up under a real spike. **The first `packages/kindle` task must be a small spike verifying `fflate`'s exact per-entry store/order behavior** (unzip the output with an independent tool, assert entry 0 is `mimetype`, stored, exact bytes `application/epub+zip`) before `zip.ts` is written as the real implementation.

**3. Cross-reference links need a two-pass build.**
The sanitizer only allows same-document `#eNNNN` fragment hrefs (SPEC §5.4), but entries are split one-file-per-initial-letter (SPEC §5.3). A cross-reference from an entry in `content-a.xhtml` to an entry in `content-w.xhtml` needs `content-w.xhtml#e0123`, not just `#e0123`. `packages/kindle` assigns every entry's sequential id and destination file in a first pass, then rewrites `href="#eNNNN"` to `href="content-{letter}.xhtml#eNNNN"` during rendering in a second pass — entirely internal to the generator, no schema or API impact.

**4. Object storage client: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, not a MinIO-specific SDK.**
The identical code path works against MinIO (`endpoint` override + `forcePathStyle: true`) and real S3 or any other S3-compatible provider (no override, default virtual-hosted addressing) — driven purely by whether `S3_ENDPOINT` is set, no separate config flag. This matches the already-generic `S3_*` env var names in `.env`/`.env.example` (not `MINIO_*`), and matches how `DATABASE_URL`/`REDIS_URL` avoid provider-specific code today. Interface: `putObject`, `getPresignedDownloadUrl`, `listObjects`, `deleteObjects`, `ensureBucketExists`.

`ensureBucketExists()` runs once at boot (both the HTTP process and the worker) since docker-compose provisions no bucket for MinIO. It **fails soft** — logs a warning, does not crash boot — because a real cloud deployment's scoped IAM credentials commonly cannot `CreateBucket`; the bucket is expected to be provisioned out-of-band there.

**5. BullMQ runs in a separate `apps/api/src/worker.ts` process, not inside the Fastify server.**
EPUB generation (hashing every entry, zipping) is CPU-bound. Node has one event loop per process; running builds in the same process as the public HTTP API risks stalling `/api/search`, auth, and every other route while a build runs — an availability risk on top of SPEC's own "a failed build must never take a working dictionary offline" correctness concern. Nothing today runs a background worker, so this isn't breaking an existing convention. In production this is a genuinely separate deployable/scalable process from the API server (separate `start`/`build:worker` scripts), which is exactly why it's a distinct entrypoint rather than a thread inside `index.ts`.

For local dev, SPEC.md §10 already documents a single `pnpm dev` covering "api, worker, web" — so `apps/api`'s own `"dev"` script runs both `src/index.ts` and `src/worker.ts` concurrently (via a small `concurrently`-based script), keeping the one-command dev experience SPEC already promises rather than requiring a manual second terminal. `start`/`build` stay separate per-process commands for production deployment.

Graceful shutdown: `worker.ts` handles `SIGTERM`/`SIGINT` by closing the BullMQ `Worker` (waits for in-flight jobs), then the `Queue`, then disconnecting Prisma.

**6. Repeatable scheduling via BullMQ's `upsertJobScheduler`, not the older `repeat` option.**
`upsertJobScheduler` is idempotent by scheduler id, avoiding the well-known footgun where redeploying a worker using `repeat: { pattern }` can register duplicate repeatable jobs (silently doubling build frequency). Cron pattern comes from the already-present `BUILD_CRON` env var (`.env.example`: `0 * * * *`). **Verify the pinned `bullmq` version exposes `upsertJobScheduler`** before committing to it in a task — if it's unavailable, fall back to `repeat` with an explicit one-time cleanup of any pre-existing repeatable job by the same name before adding a new one.

**7. Content-hash comparison target: `Series.contentHash`, not a query against `Build`.**
`Series` already has an unused `contentHash String?` field. The sweep reads it directly (one row, no join) instead of querying for "the most recent SUCCESS build's contentHash." `Build.contentHash` still exists and still records what hash produced *that specific build* (an audit fact), but `Series.contentHash` is the live "what's currently built" pointer. It is updated **only when a build reaches SUCCESS** — not by the sweep when it enqueues, and not by the build job when it starts — so a build that fails after being enqueued never causes the series to be incorrectly treated as "already up to date."

**8. Retention prunes storage, not history.**
Pruning deletes the S3 objects for builds beyond the 10 most recent successful ones per series and nulls their `epubKey`/`sourceKey`, but leaves the `Build` row itself (status, contentHash, entryCount, timestamps) in place. Rows are cheap; objects are the actual storage cost. The single most recent successful build is never pruned — which also guarantees the download route (always "most recent SUCCESS") can never accidentally resolve to a pruned build. Pruning runs in the `maintenance` queue, triggered after each build reaches SUCCESS (check that series' count), not as its own separate cron.

**9. New targeted index for `Build`.**
"Most recent SUCCESS build for this series" is queried on every download-route hit and every hourly sweep tick. The existing `@@index([seriesId, createdAt])` isn't `status`-aware. Add `@@index([seriesId, status, createdAt])` via a normal Prisma-schema change (no hand-authored SQL needed — this is a plain composite index, unlike the partial-unique-index precedent elsewhere in this project which needed hand-authored SQL specifically for its `WHERE` clause).

**10. Download routes redirect, they don't stream.**
`GET /api/series/:slug/download(/source)` resolve the series, find the latest `status: SUCCESS` build, and `302` to a freshly-generated presigned URL. 302 (not 301) because the URL is time-limited and regenerated on every request — caching it as permanent would be wrong. Redirecting (not proxying bytes through Fastify) is the entire point of presigned URLs: bandwidth leaves the app server. No rate limit is applied — SPEC explicitly documents downloads as "uncapped... bandwidth leaves the app server," and the handler itself is cheap (one indexed query, local SigV4 signing, no outbound call), so omitting a limiter here is a deliberate match to documented intent, not an oversight.

**11. Frontend: one new route, one existing-component edit, nothing else.**
`apps/web/src/routes/series/$slug/index.tsx` (sibling of the existing `series/$slug/edit.tsx`) renders series info, two plain `<a href="/api/series/:slug/download...">` anchors (real browser navigations — needed for the 302 + file-save to work; not `apiXxx()` fetch wrappers, which would just fetch JSON-shaped error bodies or binary into JS memory instead of triggering a save), and the SPEC §5.6 manual-`.mobi` instructions as static text. `SearchResults.tsx`'s dictionary-name cell becomes a `Link` — `SearchResultItemDto.seriesSlug` already exists, no shared-schema change needed. No live status polling (explicitly deferred).

## Risks / Trade-offs

- **`fflate` zip-ordering behavior is unverified by actual execution** at design time → mitigated by a mandatory first-task spike + a golden-output unit test before real implementation proceeds.
- **`bullmq`'s `upsertJobScheduler` availability is unconfirmed against the version that will actually get installed** → mitigated by an explicit verification task before committing the scheduling code; documented fallback to `repeat` with manual dedup if unavailable.
- **Two-process architecture** (HTTP server + worker) adds a moving part in both dev and prod → mitigated for dev by wrapping both under one `pnpm dev` command (matching SPEC.md's existing documented promise); production deployment still needs to run and monitor two processes, which is an accepted, standard cost of CPU-bound background work.
- **`idx:infl` nested-vs-sibling placement** (SPEC's own already-flagged ambiguity — Amazon's own materials are inconsistent) cannot be fully resolved without a physical Kindle device. This change ships the nested form (SPEC's current default) and carries the device-verification step forward as an explicit follow-up task, not something blocking this change.
- **Large single-letter shelves**: SPEC's one-file-per-letter split could still produce an oversized file for an unusually large single-letter shelf (a build-log reference independently suggests ~1000 entries/file as a practical ceiling). Not a blocker at this app's expected scale; the generator logs a warning rather than implementing further chunking now.
