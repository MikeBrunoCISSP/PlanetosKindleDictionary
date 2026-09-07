## Why

The hourly dictionary-build sweep (`runSweep`) currently loads and fully re-hashes every series' Published+Approved entries and inflections, for every series, every hour — even series nobody has touched since the previous run. Work and database traffic scale with total corpus size rather than with how much actually changed, and the loop runs fully serially. A finding from an external review (PERF-001) flags this and requires that normal hourly work be proportional to changed series, that a reconciliation path still exist as a safety net, and that sweep concurrency be bounded and instrumented.

## What Changes

- Add a durable `dirtySince` marker on `Series`, set by every content-changing write transaction (entry create/approve, edit-proposal approval, series title/description edits) in the same transaction as the content change itself.
- The hourly sweep now only hash-checks series that are marked dirty or have never had a successful build (`contentHash IS NULL`), instead of scanning every series — normal hourly work becomes proportional to what actually changed.
- Clearing the dirty marker (after a hash-equal check, or after a successful build) uses an atomic compare-and-swap so a concurrent edit's dirty mark is never silently lost to a race with the clearing write.
- Add a new, independent, less-frequent (daily) reconciliation job that re-checks every series regardless of its dirty marker — the safety net for a write path that fails to mark a series dirty (a bug, or a future write path that forgets to). It reports when it finds a mismatch the fast sweep's dirty marker did not already flag.
- Bound the concurrency of per-series hash-checks within one sweep/reconciliation run (currently fully serial), and add basic instrumentation (series checked, builds enqueued, elapsed time, and reconciliation's missed-marker count) to both jobs.
- No change to the build-enqueue/dedup mechanism itself (COR-001's `deduplication` semantics are untouched) and no change to what decides whether a build is actually enqueued (the content-hash comparison remains the sole trigger).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `dictionary-management/build-automation`: the "Hourly Change-Detection Sweep" requirement is modified to describe the dirty-marker pre-filter, bounded concurrency, and instrumentation (its externally observable guarantees — unchanged series never rebuilt, changed series rebuilt exactly once, reverted edits never rebuilt, in-progress builds not duplicated — are preserved). A new "Change-Detection Reconciliation" requirement is added describing the periodic full-corpus safety net.

## Impact

- `apps/api/prisma/schema.prisma` — new nullable `Series.dirtySince` column + index; additive migration.
- `apps/api/src/lib/dirtySeries.ts` (new) — shared dirty-marking helper.
- `apps/api/src/routes/entries.ts`, `apps/api/src/routes/entryEditProposals.ts`, `apps/api/src/routes/series.ts` — call the dirty-marking helper (or fold the field into an existing update) at every write that changes hash-relevant content.
- `apps/api/src/jobs/sweep.ts` — proportional candidate query, shared per-series check with race-safe clearing, bounded concurrency, new `runReconciliation` export, instrumentation logging.
- `apps/api/src/jobs/build.ts` — race-safe dirty-marker clear on the build success path.
- `apps/api/src/worker.ts` — register and dispatch the new reconciliation repeatable job.
- `apps/api/tests/sweep.test.ts`, `apps/api/tests/sweepRebuild.test.ts` — updated so their raw-Prisma content-mutation fixtures keep exercising real sweep behavior under the new dirty-tracking query; new test coverage for proportionality, reconciliation's missed-marker detection, and the CAS-clear race.
