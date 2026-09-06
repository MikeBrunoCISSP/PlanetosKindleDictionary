## Why

The hourly sweep enqueues rebuild jobs with a deterministic
`jobId: "${series.id}-${hash}"`. BullMQ dedupes `add()` calls against *any*
retained job with that jobId, including old completed ones, and no
retention is configured to remove them. So if content state A is built,
then B is built, and the series later reverts to A, re-enqueuing A's old
jobId is silently deduplicated against the retained completed job — even
though the currently downloadable artifact is B's content. `Series.contentHash`
never returns to A, and every subsequent sweep repeats the same silent
no-op forever: users keep downloading stale content indefinitely with no
error or signal that anything is wrong (finding COR-001, high severity).

## What Changes

- The sweep's job-enqueue call drops the deterministic content-hash `jobId`
  entirely and instead uses BullMQ's `deduplication` option keyed by
  `series.id` (with `keepLastIfActive: true`). This mechanism's dedup key is
  cleaned up by BullMQ on every job finalization (success or failure),
  unlike a retained jobId, so it cannot accumulate stale state that
  permanently blocks a legitimate future rebuild — closing the bug
  structurally rather than by tuning a retention count.
- Concurrent-duplicate prevention (the sweep's original purpose for using a
  deterministic jobId) is preserved: repeated sweeps while a build for the
  same series is still waiting or active continue to enqueue only once.
- New tests: a real end-to-end A→B→A test (build A to completion, build B to
  completion, revert to A, confirm a genuine new build is enqueued and
  completes) against real Postgres/Redis — the one scenario no existing
  test exercises — plus a test for the previously-unverified "sweep fires
  again while a build is actively running" case.
- One existing test's assertion on the now-removed literal jobId string is
  updated to match the new mechanism; no behavioral regression.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `dictionary-management/build-automation`: the "Hourly Change-Detection
  Sweep" requirement's enqueue-idempotency wording is corrected — enqueueing
  is idempotent only while a build for that content state is already
  outstanding (waiting or active), not permanently per content hash — and
  gains scenarios for a reverted content state and for a sweep firing while
  a build is actively in progress.

## Impact

- `apps/api/src/jobs/sweep.ts` — the `add()` call's job options.
- `apps/api/tests/sweep.test.ts` — one assertion updated; new test coverage
  for the A→B→A and active-build-in-progress scenarios.
- No changes to `apps/api/src/lib/queues.ts` (deduplication is a per-`add()`
  option, not queue-level config), `apps/api/src/jobs/build.ts` (unaffected —
  it only reads `seriesId` and recomputes the hash live), or
  `apps/api/src/routes/downloads.ts`'s manual-rebuild route (it already uses
  no jobId and never had this bug; giving it its own dedup protection
  against repeated admin clicks is a separate, unrelated concern, out of
  scope here).
