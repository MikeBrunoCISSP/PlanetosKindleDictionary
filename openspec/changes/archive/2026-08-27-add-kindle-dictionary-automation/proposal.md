## Why

`SPEC.md` §5 (Kindle dictionary format) and §7 (Background jobs) already contain a complete, researched design for generating and serving Kindle dictionary files — verified against Amazon's own KDP dictionary-authoring docs and a practical build-log reference — but none of it is built. There is no `packages/kindle`, no job queue, no object-storage client, no download route, and no way for anyone (logged in or not) to obtain a dictionary for any series in the app. This change turns that existing design into a working, hourly-automated pipeline: detect changed series, generate the EPUB, store it, and serve it publicly.

## What Changes

- New workspace package `packages/kindle`: pure functions that turn Series/Entry/Inflection data into an in-memory Kindle-format EPUB file list (XHTML content documents with `idx:entry`/`idx:orth`/`idx:infl`/`idx:iform` markup, OPF with dictionary `x-metadata`, deterministic UUIDv5 identifier), a deterministic content-hash function used for change detection, and a zip assembler producing a correctly-structured EPUB (mimetype entry first, stored uncompressed, per the EPUB OCF spec).
- New object-storage client (`apps/api/src/lib/storage.ts`) using the AWS S3 SDK against MinIO in dev and any S3-compatible provider in prod via the same code path and the already-defined `S3_*` env vars.
- New BullMQ-based background-job infrastructure running as a separate worker process (`apps/api/src/worker.ts`, new `worker` script): an hourly repeatable sweep that rebuilds only series whose content actually changed since their last successful build (via content-hash comparison against `Series.contentHash`, an existing but currently-unused field), a build job that generates and uploads the EPUB, and a retention job that prunes old builds' storage objects while keeping the 10 most recent per series (never the newest).
- New public routes: `GET /api/series/:slug/download` and `.../download/source` (302 → presigned URL, no login required), `GET /api/series/:slug/builds` (public build history, lean DTO). New admin route `POST /api/series/:slug/rebuild` (already documented) to force an immediate rebuild bypassing the hash check.
- New minimal frontend: `apps/web/src/routes/series/$slug/index.tsx` with download links and the already-documented manual "Make a .mobi" instructions; the dictionary name in search results becomes a link to this page.
- New admin observability: Bull Board mounted at `/admin/jobs` (admin-only), matching SPEC's "Hangfire-dashboard equivalent" framing for the new job infrastructure.
- Automated `.mobi` conversion is explicitly **out of scope** — Amazon's `kindlegen` is only distributed bundled inside the Kindle Previewer GUI app (confirmed via KDP's own docs and a practical build reference), not as a scriptable CLI, so this stays a manual, documented step exactly as SPEC.md already decided.

## Capabilities

### New Capabilities
- `dictionary-management/build-automation`: the hourly change-detection sweep, the build job (EPUB generation + storage upload), retention/pruning, and the admin manual-rebuild trigger.
- `dictionary-management/downloads`: public, unauthenticated access to the latest successful build (EPUB + sources), the public build-history read, and the minimal series detail page that surfaces these.

### Modified Capabilities
(none — `dictionary-management/delete-dictionary` is unaffected; `search/dictionary-search`'s result rendering gains a link but no requirement changes, since "results are a grid with a dictionary-name column and a linked headword" already covers rendering the row, and linking the dictionary name is additive presentation, not a new/changed observable requirement)

## Impact

- New workspace package: `packages/kindle` (new `package.json`, added as a dependency of `apps/api`).
- `apps/api/package.json`: new dependencies `bullmq`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@bull-board/api`, `@bull-board/fastify`, `fflate`, `uuid`; new `worker`/`build:worker` scripts.
- `apps/api/src/lib/storage.ts` (new), `apps/api/src/worker.ts` (new), `apps/api/src/jobs/` (new: sweep, build, prune), `apps/api/src/routes/downloads.ts` (new), `apps/api/src/lib/errors.ts` (new `NO_BUILD_AVAILABLE` error), `apps/api/src/index.ts` (mount Bull Board, admin-gated).
- `apps/api/prisma/migrations/`: one new migration adding a targeted index for "latest successful build per series" (no model/enum changes — `Build`/`BuildStatus`/`Series.contentHash` already exist and already match the design).
- `apps/web/src/routes/series/$slug/index.tsx` (new), `apps/web/src/components/SearchResults.tsx` (dictionary name becomes a link).
- No changes to existing authentication, entry-submission, or approval-workflow behavior.
