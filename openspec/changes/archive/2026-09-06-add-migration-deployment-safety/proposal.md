## Why

Finding PROD-004 was raised against the pre-Railway-IaC codebase (`package.json`, `README.md` — the manual local-only migration instructions). `add-railway-deployment` has since given the **API** service a `preDeployCommand` running `prisma migrate deploy`, so acceptance criteria 1–2 already hold for the API. Two gaps remain:

- **The worker has no migration gate at all.** `.railway/railway.ts` deliberately puts `preDeploy` only on `app` ("so two services never run `migrate deploy` concurrently"). Because the API and worker deploy independently from the same push, nothing stops the worker's new version from starting — and consuming jobs — before (or without ever) the schema being current. A migration that the worker's job code depends on can land on the API's deploy while the worker is still mid-deploy or has failed to redeploy at all.
- **No documented backup or rollback-limits guidance.** The runbook documents *redeploying* a previous version, but not that redeploying code does **not** undo an already-applied migration (Prisma Migrate has no automatic down-migration), and says nothing about taking or scheduling a database backup before a risky deploy — acceptance criterion 3.
- **No guidance for writing migrations that tolerate the API/worker deploying at different times.** Since the two services aren't deployed atomically together, a migration that removes something one side's still-running code depends on can break the service that hasn't redeployed yet.

## What Changes

- **Gate the worker on migrations too.** Add `preDeploy: "pnpm --filter @planetos/api exec prisma migrate deploy"` to the `worker` service in `.railway/railway.ts`, mirroring `app`. `migrate deploy` is idempotent against the shared `_prisma_migrations` history — whichever service's deploy reaches it first does the real work; the other finds nothing pending. This removes the ordering gap without requiring the two services' deploys to be manually sequenced.
- **Document rollback limits and backup expectations** in `infra/railway/README.md`: enabling a Railway volume-backup schedule on Postgres, taking a manual on-demand backup immediately before a deployment that includes a schema-changing migration, how to restore, and an explicit statement that rolling back application code does not reverse an applied migration.
- **Document an expand/contract authoring rule for migrations**: a migration that removes or narrows something still read by code that may still be running under the old version (the API or worker, whichever hasn't redeployed yet) ships only after a prior release has already stopped depending on it. Purely additive migrations (new nullable columns/tables/indexes) need no such split.
- Cross-reference the above from `SPEC.md` and the root `README.md`.

Not in scope: an automated migration-linting tool, a shadow-database CI check, or changing Prisma's migration engine/behavior itself.

## Capabilities

### Modified Capabilities

- `deployment/railway`: "Database migrations are applied before the new version serves traffic" extends to the worker service (not just the API), with no manual coordination required between the two services' deploys.

### New Capabilities

- (none — the two additional guarantees below are added as new requirements under the existing `deployment/railway` capability, not a new capability)

## Impact

- **`.railway/railway.ts`** — `worker` service gains `preDeploy`; updated comments on both services explaining the (now mutual) migration gate.
- **`infra/railway/README.md`** — §7 gains "Writing safe migrations" and "Rollback & backups" subsections; the day-two "Roll back" row cross-references the rollback limits.
- **`SPEC.md`**, **`README.md`** — one-line cross-references to the runbook's migration guidance.
- **No `apps/api` code change** — `prisma migrate deploy` is already the command in use; this only changes *which services* run it and what the runbook says.
