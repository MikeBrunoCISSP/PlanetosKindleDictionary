## Context

See proposal.md — Why. Design-relevant current state, confirmed by reading the actual code and BullMQ's compiled Lua scripts (not just its `.d.ts` files):

- `apps/api/src/jobs/sweep.ts:35-39` enqueues with `{ jobId: \`${series.id}-${hash}\`, ...BUILD_JOB_RETRY_OPTIONS }`. `apps/api/src/lib/queues.ts` sets no `removeOnComplete`/`removeOnFail` on either `Queue` construction.
- BullMQ 5.81.3 (`pnpm-lock.yaml`-resolved version for the pinned `^5.34.0`), `dist/cjs/commands/addStandardJob-9.lua` lines 88-97: when a custom `jobId` is supplied, `if rcall("EXISTS", jobIdKey) == 1 then return handleDuplicatedJob(...) end` runs **before** the script ever reaches `deduplicateJob(opts['de'], ...)`. A deterministic content-hash `jobId` and BullMQ's `deduplication` option are therefore mutually incompatible — the jobId-existence check short-circuits unconditionally, so layering `deduplication` on top of the existing jobId scheme would fix nothing.
- Traced `deduplicateJob.lua` → `storeDeduplicatedNextJob.lua` → `removeDeduplicationKeyIfNeededOnFinalization.lua`: the dedup key for a given `deduplication.id` is removed on every job finalization (`moveToFinished-14.lua` calls the removal unconditionally, before branching on completed vs. failed). With `keepLastIfActive: true`: a dedup key pointing at a non-active job causes a new `add()` to be deduped and resolve to that same job's ID (no second job); a dedup key pointing at an *active* job causes the new `add()`'s `{name, data, opts}` to be stashed in a side key, still resolving to the active job's ID; a further `add()` while a stash already exists overwrites it (last one wins); on the active job's finalization, the stashed data is automatically and synchronously promoted into a real new job.
- `apps/api/src/routes/downloads.ts`'s manual-rebuild route calls `add()` with no `jobId` at all — already unaffected by this bug, already unaffected by this fix.
- `apps/api/src/jobs/build.ts`'s `processDictionaryBuild(prisma, storage, seriesId)` only takes `seriesId` and recomputes the content hash live from current DB state — job *data* never encodes "which hash to build."
- `apps/api/tests/sweep.test.ts` already uses a real Redis connection and real `Queue`, but every existing test only calls `runSweep()` — none starts a real `Worker`, so none proves or disproves the retained-completed-job dedup bug itself. `apps/api/tests/build.test.ts` calls `processDictionaryBuild` directly against the real `storage.ts` module (real MinIO), not a stub — the established convention for exercising a real build.

## Goals / Non-Goals

**Goals:**
- Make a reverted content state (A→B→A) produce a real new build, structurally — not by tuning a retention number that BullMQ's own docs describe as best-effort/lazy.
- Preserve the sweep's original concurrent-duplicate-prevention behavior (repeated sweeps while a build is outstanding still enqueue once).
- Prove both with a real end-to-end test against real Redis, per the finding's own explicit request.

**Non-Goals:**
- Changing the manual-rebuild route's behavior — it has no `jobId` today and never had this bug.
- A generation-counter-plus-DB-lock scheme — considered and rejected in favor of reusing BullMQ's own `deduplication` mechanism, which needs no schema change and no new locking logic.
- Giving the manual-rebuild route its own dedup protection against repeated admin clicks — a separate, unrelated resource-usage concern, not a correctness bug, left for a future change if wanted.

## Decisions

### 1. Replace the deterministic `jobId` with `deduplication: { id: series.id, keepLastIfActive: true }`

**Decision:** `sweep.ts`'s `add()` call becomes:
```ts
await queue.add(
  "dictionary-build",
  { seriesId: series.id },
  { ...BUILD_JOB_RETRY_OPTIONS, deduplication: { id: series.id, keepLastIfActive: true } }
);
```
No explicit `jobId` — BullMQ auto-generates one, matching the manual-rebuild route's existing, already-correct pattern.

**Reasoning:** confirmed via the Lua trace in Context that this is the only one of the three candidate approaches that satisfies acceptance criterion 3 as a structural guarantee rather than a tuned heuristic:
- *Tuning `removeOnComplete`/`removeOnFail`* (rejected): BullMQ's own `.d.ts` doc comments state eviction only happens "once a subsequent job of the same kind... is processed after its age has expired" — not a background timer, not a guarantee. A series that stops producing new builds (or unlucky eviction timing) can still retain a blocking jobId indefinitely. This cannot structurally satisfy criterion 3.
- *A generation-counter-in-jobId plus a DB/queue lock* (rejected): works, but requires a new persisted counter (schema migration) and its own transaction/locking logic to serialize "read counter, increment, use as jobId suffix" against concurrent sweep runs. More moving parts than reusing a mechanism BullMQ already ships and self-cleans, for no correctness benefit over Decision 1.
- *`deduplication` keyed by `series.id`* (chosen): the dedup key's lifecycle is tied to the job's own active/finalization state via BullMQ's own Lua control flow (`removeDeduplicationKeyIfNeededOnFinalization`, called unconditionally on every finalization), not to a retention count or age. It cannot accumulate stale, permanently-blocking state.

### 2. Do not put the content hash in `jobId`, even for readability

**Decision:** leave `jobId` unset; if traceability is ever wanted, put the hash in job *data* (`{ seriesId, contentHash: hash }`) instead — inert to behavior since `processDictionaryBuild` ignores extra fields and recomputes the hash live. Not included as a required task in this change; noted as an optional follow-up only.

**Reasoning:** per the Lua trace in Context, the jobId-existence check runs unconditionally before `deduplication` is ever consulted. Any scheme that puts the hash back into `jobId` — even alongside `deduplication` — silently reintroduces exactly this bug the moment content reverts to a previously-used hash.

### 3. Concurrency correctness walkthrough

Verified against BullMQ's actual Lua behavior (Context), not just documented types:

- **Two sweep ticks while a job is waiting**: second `add()`'s dedup key points at a non-active job → deduped, resolves to that job's own ID, no second job. Same outcome as today for this specific case — no regression to the existing "twice in a row" test's expectation that repeated sweeps against unchanged, already-enqueued content produce exactly one job.
- **Two sweep ticks while a job is active**: second `add()`'s dedup key points at an active job → stashed, resolves to the active job's ID, no second *visible* job. On that job's finalization (success or exhausted-retry failure), BullMQ automatically and synchronously promotes the stash into a real new job — not a "wait for next sweep" fallback.
- **A third distinct enqueue arriving while a stash already exists**: the stash is overwritten; the earlier stashed request is silently discarded. Safe here specifically because job data never encodes "which hash to build" (Decision on `build.ts`, unchanged) — whichever promoted job eventually runs recomputes the live DB hash at that moment. If content changed again in the interim such that the promoted job's result still doesn't match, `Series.contentHash` simply won't match afterward and the next periodic sweep tick catches it — no update is permanently lost, at worst deferred one sweep interval, consistent with the sweep's existing periodic-reconciliation model.
- **The finding's own A→B→A scenario** (each edit fully settled — built and completed — before the next): the dedup key is freed at each completion, so the revert-to-A enqueue finds no existing key and creates a genuine new job. This is the case with no current test coverage and gets the new integration test (Decision 4).

### 4. Test additions

- **New A→B→A end-to-end test**: drives a real `Worker` (not just `runSweep()`) through three full cycles against real Postgres/Redis, using the real `storage.ts` module the way `build.test.ts` already does (no stub `BuildStorage` — matches established convention): build A to completion (`Series.contentHash` becomes hashA) → edit to B, sweep, let the worker complete it (`Series.contentHash` becomes hashB) → edit back to A, sweep again, assert a genuinely new job is enqueued and completes (`Series.contentHash` returns to hashA). This is the one scenario no existing test in `sweep.test.ts` exercises, since every current test only calls `runSweep()` without a paired `Worker` ever processing anything to `completed`.
- **New active-job dedup test**: exercises the `keepLastIfActive` branch specifically (the existing "twice in a row" test only exercises the waiting-job branch, since it never starts a worker) — starts a `Worker` whose processor is held from completing momentarily, fires a second sweep tick while the first job is provably active, and asserts still exactly one job total.
- **Existing test update**: `"multiple content changes..."` (`sweep.test.ts:134-151`) asserts `jobIds[0]` equals the literal `${series.id}-${finalHash}` string — no longer valid once `jobId` is auto-generated. Replace with the length-only assertion already present two lines above.
- **Existing test to verify unmodified**: `"running the sweep twice in a row..."` — its same-job-ID-across-two-calls assertion should still hold under the new mechanism (dedup against a waiting job resolves to that same job's own auto-generated ID); re-run to confirm, no code change expected.

### 5. No changes to `queues.ts`, `build.ts`, or `downloads.ts`

`deduplication` is a per-`add()` `JobsOptions` field (part of `CompressableJobOptions`), not queue-level configuration — no change needed in `queues.ts`. `build.ts` only reads `seriesId` from job data — unaffected regardless of jobId/dedup scheme. `downloads.ts`'s manual-rebuild route has no `jobId` today and is untouched by this change; its own potential need for `deduplication` protection against repeated admin clicks is a distinct, unrelated concern, explicitly out of scope (see proposal.md — Impact).

## Risks / Trade-offs

- **[Risk]** `deduplication` support depends on the BullMQ version actually installed within the pinned `^5.34.0` semver range; confirmed present in the currently lockfile-resolved `5.81.3` by direct inspection of shipped `.d.ts` and Lua files, but the exact minimum BullMQ version that introduced it wasn't independently confirmed against BullMQ's changelog. → Mitigation: the committed `pnpm-lock.yaml` pins the exact resolved version for normal installs, so there's no drift risk under today's lockfile; flagged as a task to spot-check BullMQ's release notes so a future lockfile regeneration within the same semver range can't silently land on a version that lacks it.
- **[Trade-off]** Losing the human-readable `seriesId-hash` jobId makes ad hoc Redis/Bull Board inspection slightly less informative about which content state a queued job corresponds to. → Mitigation: optional follow-up (Decision 2) to carry the hash in job data instead; not required for this fix.
- **[Risk]** The new A→B→A test genuinely drives a `Worker` through real builds (real storage writes via MinIO, matching `build.test.ts`'s convention) — this is a heavier integration test than the current `sweep.test.ts` suite, with proportionally longer runtime and a hard dependency on both Postgres and Redis (and now MinIO too) being reachable. → Mitigation: acceptable given the finding explicitly asks for exactly this test; if this session's sandbox still lacks reachable infrastructure, note the limitation transparently per this session's established pattern rather than skipping the test or claiming a false pass.

## Migration Plan

Purely a job-options change in application code; no schema, no data, no deployment-topology impact.

1. Land the `sweep.ts` change, the doc-comment rewrite, and the test changes/additions together.
2. No operator action needed — this deploys like any other code change via the existing Railway pipeline.
3. Post-deploy: no special verification beyond normal test coverage; the bug is a race/edge-case in content-revert timing, not something with an immediate operational signal to check.

Rollback: revert the change; the sweep returns to deterministic-jobId dedup, reinstating the documented bug.
