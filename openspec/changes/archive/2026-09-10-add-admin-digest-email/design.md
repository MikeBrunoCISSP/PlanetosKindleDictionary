## Context

Confirmed by reading the actual code:

- **"Pending work" already has one merged concept**: `GET /api/admin/review-queue` (`apps/api/src/routes/entryEditProposals.ts:245-298`) already queries `prisma.entry.findMany({ where: { approvalStatus: "PENDING" } })` and `prisma.entryEditProposal.findMany({ where: { status: "PENDING" } })` and merges them into one admin-facing queue (`NEW_ENTRY` and `EDIT` items together). This is the existing precedent for what "edits to approve" means in this app: new entry submissions and edit proposals are already treated as one review workload, not two separate ones. The digest counts follow the same split — `prisma.entry.count({ where: { approvalStatus: "PENDING" } })` plus `prisma.entryEditProposal.count({ where: { status: "PENDING" } })` — rather than reusing the paginated review-queue query, since the digest only needs totals, not items.
- **Pending users** is `prisma.user.count({ where: { approvalStatus: "PENDING" } })`, the same predicate `GET /api/admin/users/pending` already uses.
- **Scheduled jobs already follow one clear pattern** (`apps/api/src/worker.ts`): a BullMQ `upsertJobScheduler(schedulerId, { pattern }, { name, data })` call on a queue, idempotent by scheduler id (safe to run on every worker boot/redeploy), with the job's own name branch inside that queue's job processor. `reconcile-pending-emails` on the existing `email` queue is the closest analog — same queue, same "log on failure, no bespoke retry machinery" posture.
- **`BUILD_CRON` is the existing precedent for a configurable schedule**: read via `config.ts`'s `operational()` helper, which always falls back to a documented default and is never subject to strict-mode "required" validation — the schedule itself is inherently optional/defaulted, never a startup-blocking value.
- **`CONTACT_RECIPIENT_EMAIL` is the existing precedent for a destination-address config value**: required in strict mode, validated as email-shaped, deliberately *not* run through `MAIL_FROM_ADDRESS`'s sender-domain blocklist (a destination inbox isn't a sending identity), and listed in `WORKER_REQUIRED` because the worker is what actually sends mail (`processEmailOutbox`/`processContactMessage` both run worker-side) — a lesson this project already learned the hard way once this session (a mail-related var declared for `api` but missing from `WORKER_REQUIRED` silently breaks sending in strict mode).
- **User's decision**: a new dedicated `ADMIN_DIGEST_RECIPIENT_EMAIL`, not a reuse of `CONTACT_RECIPIENT_EMAIL` — keeps this feature's config independent in case the digest and the contact form should ever go to different inboxes.
- **User's decision**: the schedule is configurable via a cron expression, not hardcoded — a new `ADMIN_DIGEST_CRON`, following `BUILD_CRON`'s exact shape.
- **No existing durable-record pattern fits this**: `EmailOutbox` and `ContactMessage` both exist to make a single, specific, user-triggered message durable and retryable (verification links, reset links, a visitor's contact submission) — each is meaningful to redeliver on its own. A digest is a snapshot of current counts; a digest that failed to send yesterday has nothing worth redelivering today, since today's snapshot has already superseded it. The scheduled jobs that already have this same "snapshot, not a message queue" shape (`sweep-changed-series`, `reconcile-all-series`, `cleanup-storage`) all skip the outbox pattern entirely and just log-on-failure — the digest follows them, not `EmailOutbox`.

## Goals / Non-Goals

**Goals:**
- One email per scheduled run, sent only when there's something to review.
- Schedule and recipient both configurable without a code change or redeploy of code (just an env var change).
- Reuses the existing `email` BullMQ queue and worker process — no new queue, no new Prisma model.

**Non-Goals:**
- No per-recipient delivery tracking, retry queue, or admin-visible send history for the digest itself (unlike verification/reset/contact email). A failed send is logged; tomorrow's run is the natural retry.
- No digest content beyond the two counts and a link to the admin dashboard — no listing of the individual pending items (that's what clicking through to `/admin` is for).
- No per-admin preferences (e.g. opting out, choosing a different time per admin). One recipient address, one schedule, matching the single-operator reality of this deployment today.

## Decisions

1. **New `apps/api/src/lib/adminDigest.ts`** exporting `runAdminDigest(prisma): Promise<void>`:
   ```ts
   export async function runAdminDigest(prisma: PrismaClient): Promise<void> {
     const [pendingUsers, pendingEntries, pendingEditProposals] = await Promise.all([
       prisma.user.count({ where: { approvalStatus: "PENDING" } }),
       prisma.entry.count({ where: { approvalStatus: "PENDING" } }),
       prisma.entryEditProposal.count({ where: { status: "PENDING" } }),
     ]);
     const pendingEdits = pendingEntries + pendingEditProposals;
     if (pendingUsers === 0 && pendingEdits === 0) return;
     await sendAdminDigestEmail({ pendingUsers, pendingEdits });
   }
   ```
   "Edits" = pending new-entry submissions + pending edit proposals, matching the existing `review-queue` merge (see Context). Exported and unit-testable independent of the worker/queue plumbing.

2. **New `sendAdminDigestEmail({ pendingUsers, pendingEdits })` in `mailer.ts`**, following the existing plain-text style (`sendContactMessageEmail` is the closest template): subject `"Pending review digest"`, body stating both counts in plain language and a link to `${config.publicBaseUrl}/admin`. Sent to `config.adminDigestRecipientEmail`. No `replyTo` (unlike the contact-form email — there's no visitor to reply to here).

3. **New repeatable job on the existing `email` queue**, registered in `worker.ts` next to `reconcile-pending-emails`:
   ```ts
   await emailQueue.upsertJobScheduler(
     "send-admin-digest",
     { pattern: config.adminDigestCron },
     { name: "send-admin-digest", data: {} }
   );
   ```
   and a new branch in `processEmailQueueJob`:
   ```ts
   if (job.name === "send-admin-digest") {
     await runAdminDigest(prisma);
     return;
   }
   ```
   A thrown error surfaces through the existing `emailWorker.on("failed", ...)` log line, same as every other scheduler job here — satisfies the spec's "logged, not fatal" requirement with zero new machinery.

4. **New config, `apps/api/src/config.ts`**:
   - `ADMIN_DIGEST_CRON`: added to `DEV_DEFAULTS` (`"0 13 * * *"` — 13:00 UTC, a quiet off-peak hour matching `reconcile-all-series`'s `"0 3 * * *"` in spirit) and read via `operational("ADMIN_DIGEST_CRON")`. No strict-mode requirement check, exactly like `BUILD_CRON` — the schedule is never startup-blocking, only ever defaulted.
   - `ADMIN_DIGEST_RECIPIENT_EMAIL`: added to `DEV_DEFAULTS` (e.g. `"admin-digest@localhost"`) and validated exactly like `CONTACT_RECIPIENT_EMAIL` — required + email-shaped in strict mode, no sender-domain blocklist (it's a destination, not a sending identity) — and added to `WORKER_REQUIRED` since the worker is what sends it.
   - Both new fields added to the `Config` interface and `parseEnv()`'s return object (`adminDigestCron`, `adminDigestRecipientEmail`).

5. **No Prisma schema change.** Both counts are plain `count()` queries against existing tables; nothing about the digest itself needs to be persisted (see Context's last bullet).

## Risks / Trade-offs

- **[Risk]** A worker outage spanning a scheduled run silently skips that day's digest (no catch-up/backfill). → **Mitigation**: acceptable per Non-Goals — it's a snapshot, not a queue; the next day's run reports current state either way, and nothing is lost (the underlying pending items are still visible in the admin dashboard regardless).
- **[Risk]** `ADMIN_DIGEST_CRON` has no format validation (matching `BUILD_CRON`'s existing precedent), so a malformed cron expression is only caught by BullMQ at `upsertJobScheduler()` time, not at config-validation time. → **Mitigation**: same behavior the codebase already accepts for `BUILD_CRON`; not introducing a new inconsistency, and a malformed schedule fails loudly (worker startup throws) rather than silently.
- **[Risk]** Introducing a second destination-address variable (`ADMIN_DIGEST_RECIPIENT_EMAIL` alongside `CONTACT_RECIPIENT_EMAIL`) means one more variable to remember to set on **both** Railway services (`app` and `worker`) at deploy time. → **Mitigation**: `infra/railway/README.md` / `BREVO.md` gets the same explicit "set on both services" callout `CONTACT_RECIPIENT_EMAIL` already has, and `WORKER_REQUIRED` fails worker startup loudly if it's missing there.

## Migration Plan

- Purely additive: new config keys (both defaulted in dev/test, so no existing local setup breaks), no schema migration, no changes to any existing route or requirement.
- Deploy: set `ADMIN_DIGEST_RECIPIENT_EMAIL` (and optionally override `ADMIN_DIGEST_CRON`) on **both** the `app` and `worker` Railway services before or during the deploy that ships this change; the worker will fail to start in strict mode without the recipient set, same fail-fast behavior `CONTACT_RECIPIENT_EMAIL` already has.
- Rollback: revert the code; the two env vars are inert if left set with no code reading them.
