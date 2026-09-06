## Context

See proposal.md — Why. Design-relevant current state:

- `.railway/railway.ts` (`add-railway-deployment`): `app` service has `preDeploy: "pnpm --filter @planetos/api exec prisma migrate deploy"`. The comment explains the deliberate choice: *"On the app only - never the worker - so two services never run `migrate deploy` concurrently."* `worker` has no `preDeploy` at all.
- `apps/api/prisma/migrations/` is the classic Prisma Migrate format (`<timestamp>_<name>/migration.sql` + `migration_lock.toml`, tracked in a `_prisma_migrations` table) — the CLI/engine version in use is Prisma 6.19.3 (confirmed in the PROD-002 work session). This is *not* the newer "Prisma 8 contract/marker" system that Prisma's current live docs describe by default; those pages could not be used to confirm concurrency-locking behavior for this version.
- `infra/railway/README.md` §7 already states migrations run automatically on `app` and documents the one-time admin seed. §10 "Day-two operations" has a "Roll back" row (`railway deployment list` + redeploy the previous good deployment) with no mention of what rollback does *not* undo.
- Railway supports per-volume backups (the Postgres service's volume): manual on-demand triggers plus daily/weekly/monthly scheduled options with 6/27/89-day retention respectively, and a dashboard restore flow. Nothing in the runbook currently tells the operator to use this.
- Both services build from the same monorepo and the same migration folder; there is exactly one `_prisma_migrations` history, shared by both.

## Goals / Non-Goals

**Goals:**

- Close the worker's migration gap without introducing manual, deploy-order-dependent steps for the common case.
- Make the limits of "rollback" explicit so an operator doesn't assume redeploying old code also undoes a migration.
- Give contributors a concrete, checkable rule for when a migration needs to be split across two releases.

**Non-Goals:**

- A shadow-database CI drift check, a migration linter, or blue/green schema tooling — out of scope; this change is about the deploy-time gate and the runbook, not new tooling.
- Changing Prisma's migration engine, adding a custom lock, or building a "run migrations exactly once via a dedicated release step" mechanism (e.g. a one-off Railway job) — see Decision 1 for why the simpler mirrored-`preDeploy` approach was chosen instead.
- Automating backups beyond documenting how to turn Railway's existing feature on.

## Decisions

### 1. Mirror `preDeployCommand` onto the worker, rather than a dedicated migration step

**Decision:** add the identical `preDeploy: "pnpm --filter @planetos/api exec prisma migrate deploy"` to the `worker` service.

**Reasoning:** `prisma migrate deploy` is idempotent against the shared `_prisma_migrations` table — a migration already recorded as applied is skipped. So running it from both services' pre-deploy steps means: whichever deploy reaches that step first does the real work; the other finds nothing pending and exits immediately. Neither service's application code starts until *its own* pre-deploy step has completed, which is exactly the guarantee the spec now asks for on both sides — with no dependency graph, deploy-ordering flag, or manual sequencing between the two services' independent Railway deploys.

**Risk carried forward, not fully resolved:** if a deployment introduces a *new* migration and both services happen to redeploy at almost the same instant, both pre-deploy steps could observe the same not-yet-applied migration and attempt it concurrently. Prisma's current documentation (default to a newer major version) could not be used to confirm classic `migrate deploy`'s locking behavior for the exact version this repo pins. The practical exposure is small and already partially accepted by the existing `app`-only design: this project's migrations to date are simple, additive, single-statement changes on a low-traffic service, and Railway's own behavior (fail-closed pre-deploy keeps the *previous* version of that specific service running) still holds even if one side's attempt fails outright. A failed pre-deploy is not a data-corrupting event on its own — it is a deploy that doesn't happen, which is the acceptance criterion asked for ("a failed migration prevents the new deployment from serving traffic"). Recorded as a residual risk below rather than blocking on it.

*Alternative — a single dedicated "migrate" Railway service/job that both `app` and `worker` depend on*: would give a real happens-before guarantee, but `railway/iac` has no service-dependency/ordering primitive to express "worker's deploy waits on app's job"; building that out-of-band (e.g. a GitHub Actions step that runs `migrate deploy` before triggering both Railway deploys) is a materially larger change (a new CI credential, a new failure mode to operate) for a monorepo this size. Rejected for this change; worth reconsidering if the schema starts changing more aggressively or the two services' deploy timing diverges further.

*Alternative — a status-only check on the worker (`prisma migrate status`, fail closed if anything is pending) instead of applying*: avoids the concurrent-apply question entirely, but makes a worker redeploy fail by default on every release that includes a new migration (whichever service's build finishes first "wins"; the other reads pending and fails), requiring a manual `railway redeploy --service worker` after `app` finishes. Rejected as the default because it turns a routine deploy into a two-step manual process; the mirrored `preDeploy` keeps the common path automatic.

### 2. Backup and rollback guidance lives in the runbook, not a new document

Extends `infra/railway/README.md` §7 with two subsections rather than a new top-level file — operators already look there for anything deploy-related, and the existing numbering (§8 Turnstile, §9 domain, §10 day-two ops, §11 Docker fallback) stays stable since these are subsections (§7.1, §7.2) under the existing §7.

- **§7.1 Writing safe migrations** — the expand/contract rule from the spec, in plain operator/contributor language, with one concrete example (adding a column vs. dropping one).
- **§7.2 Rollback & backups** — states plainly that `railway redeploy` (§10) reverts *code*, not an applied migration; walks enabling a backup schedule on the Postgres volume and taking a manual one before a risky deploy; points at Railway's restore flow.

§10's existing "Roll back" row gets a one-line cross-reference to §7.2 rather than duplicating the caveat there.

### 3. No code change in `apps/api`

The command that runs (`prisma migrate deploy`) is unchanged; only *which service* runs it changes, plus documentation. No new dependency, no new script.

## Risks / Trade-offs

- [Risk] Concurrent first-time `migrate deploy` from both services on the same brand-new migration — see Decision 1. Mitigated by keeping migrations small/additive per Decision-2's authoring rule, and because a failed pre-deploy on either service simply doesn't cut that service over (no partial-schema traffic).
- [Risk] An operator skips the backup step despite the documentation — process guidance can't be enforced by the platform. Mitigated by putting it directly in the pre-deploy path of the runbook (§7, read before every deploy that touches schema) rather than a separate rarely-read doc.
- [Trade-off] The expand/contract rule is a documented convention, not a lint rule — a contributor could still ship a destructive migration in the same release as the code removal. Automating this (e.g. a CI check diffing the migration against removed Prisma schema fields) is a reasonable follow-up, not required for this change.

## Migration Plan

Purely additive to the deployment lifecycle; no schema or data changes.

1. Land the `.railway/railway.ts` change + runbook/doc updates.
2. Operator: `railway config plan` → `railway config apply` picks up the worker's new `preDeploy`. No new variables to set.
3. Operator: enable a Postgres backup schedule (Railway dashboard → the `postgres` service's Backups tab) as part of closing this out — a one-time dashboard action, not expressible in `railway/iac`.

Rollback: revert the change (drop the worker's `preDeployCommand`); this returns to today's app-only gating, with the documented risk reinstated.

## Open Questions

- Whether to eventually add a CI check that flags a migration removing a column/table/enum value still referenced by `apps/api/src` at the same commit — a stronger, automated version of the expand/contract rule. Doesn't change this change's spec or tasks; a reasonable follow-up.
