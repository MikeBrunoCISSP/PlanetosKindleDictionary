## 1. Railway IaC — gate the worker on migrations

- [x] 1.1 In `.railway/railway.ts`, add `preDeploy: "pnpm --filter @planetos/api exec prisma migrate deploy"` to the `worker` service definition, mirroring `app`. Verify `pnpm run typecheck:railway` passes. (Done; typecheck clean.)
- [x] 1.2 Update the comment on `app`'s `preDeploy` (currently claims migrations run "on the app only - never the worker") and add an equivalent comment on the worker's, both explaining that `migrate deploy` is idempotent against the shared migration history so either service's pre-deploy step may be the one that actually applies a pending migration. Verify the comments read consistently with design.md Decision 1. (Comments updated on both services; matches Decision 1's reasoning.)

## 2. Runbook — writing safe migrations

- [x] 2.1 In `infra/railway/README.md`, add a `### 7.1 Writing safe migrations` subsection under the existing `## 7. First deploy: migrations and seed`: state the expand/contract rule (a migration removing/narrowing something either service's still-running old code might read ships only after a prior release has stopped depending on it; purely additive migrations need no split), with one short concrete example of each case. Verify the section reads standalone (an author who only reads §7.1 knows the rule and one example of each side). (Added with legacyNote-drop and reviewedAt-add examples.)
- [x] 2.2 Update §7's opening description to say migrations now run as the pre-deploy step of **both** `app` and `worker` deploys (not just `app`). (Done.)

## 3. Runbook — rollback & backups

- [x] 3.1 Add a `### 7.2 Rollback & backups` subsection: state plainly that `railway redeploy` (§10) reverts application code only and does **not** undo an already-applied database migration (Prisma Migrate has no automatic down-migration). Document enabling a Postgres backup schedule (Railway dashboard → `postgres` service → Backups tab → daily/weekly/monthly) and taking a manual on-demand backup immediately before deploying a change that includes a schema-changing (especially destructive) migration, plus how to restore one. Verify the subsection names the exact dashboard path (service → Backups tab). (Added; names `postgres` service → Backups tab.)
- [x] 3.2 In §10's "Roll back" row, add a one-line cross-reference to §7.2 for the code-vs-schema rollback caveat. Verify the row still fits the existing table format. (Done; table format preserved.)

## 4. Cross-references

- [x] 4.1 `SPEC.md` — in the "Deployment" bullet list (§3), add one bullet noting migrations gate both the `app` and `worker` deploys and pointing at `infra/railway/README.md` §7 for the authoring/rollback/backup rules. (Done.)
- [x] 4.2 Root `README.md` — in the local "Run migrations" step, add one line noting that in production this runs automatically as a Railway pre-deploy step on both services (link to the runbook), so a reader doesn't think production requires the same manual command. (Done.)

## 5. Verification

- [x] 5.1 `pnpm run typecheck:railway` passes with the worker's new `preDeploy`. (Re-confirmed clean.)
- [x] 5.2 Read-through: every new/changed cross-reference (SPEC.md → runbook §7, README.md → runbook, §10 → §7.2) resolves to a section that actually exists after the edits. (Confirmed §7, §7.1, §7.2 all present.)
- [x] 5.3 `openspec validate add-migration-deployment-safety --strict` passes. (Passed: "Change 'add-migration-deployment-safety' is valid".)
- [x] 5.4 Note for the operator (record in the runbook, not automatable here): after `railway config apply` picks up the worker's `preDeploy`, confirm via `railway logs --service worker --build` that the next worker deploy actually runs `prisma migrate deploy` before "workers started"; and enable a Postgres backup schedule in the dashboard per §7.2. (Guidance is recorded in runbook §7.2 and design.md Migration Plan; this is an operator action outside the scope of an automated task.)
