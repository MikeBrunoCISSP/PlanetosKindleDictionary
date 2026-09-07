## Context

See proposal.md — Why. Design-relevant current state, confirmed by reading the actual code (not assumed from the finding):

- `apps/api/tests/authEmailResilience.test.ts` already locks in that a mailer failure never fails the response for `register`/`forgot-password`/`resend-verification` — that guarantee predates this change and stays true after it (the new tests replace *how* it's proven, not the guarantee itself).
- `apps/api/src/lib/mailer.ts`'s `sendViaBrevoApi` issues a plain `fetch` with no timeout. `sendVerificationEmail` is used by both `register` and `resend-verification`; `sendPasswordResetEmail` only by `forgot-password`. `sendAccountApprovedEmail` (admin-approval path) is untouched by this change — not named in the finding, a different route.
- `register`'s `user.create` and `emailVerificationToken.create` are two independent, non-transactional Prisma calls today. `forgot-password`/`resend-verification` invalidate the prior unused token (`updateMany`, committed) *before* creating the replacement — with no transaction spanning the two and no durable record a delivery attempt exists at all.
- The raw token (`randomBytes(32).toString("hex")`) is generated in the request and never persisted in plaintext anywhere today — only its SHA-256 hash goes into `PasswordResetToken`/`EmailVerificationToken`. A deferred job needs the raw value (embedded in the verify/reset URL) to send the email, so it must be captured at creation time into whatever the job reads from — and that value is exactly as sensitive as the token itself.
- `apps/api/src/lib/crypto.ts`'s `encrypt`/`decrypt` (AES-256-GCM, keyed by the already-startup-validated `config.settingsEncryptionKey`) already exists and is used for exactly this class of problem (`TurnstileSettings.secretKeyEncrypted`).
- `Build` (schema.prisma) is the established style for "a persisted record of an attempted operation with retry-relevant state": a status enum, `error String?`, timestamps, a composite index for status-based queries.
- `apps/api/src/lib/queues.ts`/`worker.ts` already host two BullMQ queues (`dictionary-build`, `maintenance`) behind one shared Redis connection; `sweep.ts`'s `BUILD_JOB_RETRY_OPTIONS` (`attempts: 3`, exponential backoff) is the established producer-side retry convention, and the SEC-001/COR-001 work established `deduplication: { id, keepLastIfActive: true }` (not `jobId`) as the correct way to prevent duplicate-in-flight jobs without permanently blocking a legitimate future one.
- Bull Board is already mounted at `/admin/jobs`, admin-gated, for the existing two queues — it already provides failed-job visibility and manual retry from its UI.
- `openspec/specs/notifications/email-delivery/spec.md` (from PROD-003) already has a "Sending is best-effort for the triggering operation" requirement — this change extends it rather than creating a parallel capability.

## Goals / Non-Goals

**Goals:**
- Remove the external HTTP call from the request path's critical path entirely (not just from affecting the response's success/failure, which is already solved).
- Make the "don't invalidate the prior token early" guarantee a structural property of one transaction, not a sequencing convention.
- Give delivery failures a durable, queryable, retryable representation with no new admin UI.

**Non-Goals:**
- Touching `sendAccountApprovedEmail` or the admin-approval route — not named in this finding.
- Touching `reset-password`/`verify-email` (token *consumption*) — already fixed under SEC-002; this change is about the *creation/sending* side only.
- Building bespoke admin UI for failed-delivery recovery — Bull Board already provides this for the existing queues; the new queue reuses it.
- A generic outbox for *all* transactional email in the system — scoped to exactly the three routes this finding names.

## Decisions

### 1. `EmailOutbox` model, encrypted payload, cleared on success

```prisma
enum EmailOutboxType { VERIFICATION PASSWORD_RESET }
enum EmailOutboxStatus { PENDING SENT FAILED }

model EmailOutbox {
  id               String            @id @default(cuid())
  type             EmailOutboxType
  recipientEmail   String
  payloadEncrypted String?
  status           EmailOutboxStatus @default(PENDING)
  attempts         Int               @default(0)
  error            String?
  sentAt           DateTime?
  createdAt        DateTime          @default(now())

  @@index([status, createdAt])
}
```

`payloadEncrypted` holds the verify/reset URL (the only piece of information the job needs beyond `type`/`recipientEmail` — it embeds the raw token), encrypted with the existing `crypto.ts` helpers. Nulled once `status` becomes `SENT`, so a decryptable copy of an active token doesn't sit at rest longer than necessary. A purely additive migration — no existing table touched, no rolling-compatibility split needed per the `add-migration-deployment-safety` authoring rule.

**Alternative — store the raw token as plaintext, matching the URL as-sent**: rejected outright. The primary token tables deliberately store only a hash specifically so a DB compromise can't yield usable tokens; an unencrypted outbox row would quietly reintroduce that exact exposure through a side door.

### 2. One interactive transaction per route, spanning token + outbox

`forgot-password`/`resend-verification`: the prior-token `updateMany` invalidation, the new token `create`, and the outbox `create` all move inside one `prisma.$transaction(async (tx) => {...})`. `register`: `user.create`, `emailVerificationToken.create`, and the outbox `create` join one transaction (currently two independent statements — this closes a smaller pre-existing gap where a `user` row could exist with no token if the second write ever failed). The route's queue-enqueue call happens **after** the transaction commits, not inside it — enqueueing is a Redis operation, not something that should be part of a Postgres transaction's atomicity boundary, and a job referencing a not-yet-committed outbox row would be a real race if the worker somehow ran before commit.

**Why this satisfies "avoid invalidating the prior token until the replacement has a durable delivery job" precisely**: if the transaction fails at any point — including the outbox `create` step specifically — everything in it rolls back, so the prior token's invalidation itself is undone. There's no window where the old token is gone and the new one lacks a durable record; either both exist together, atomically, or neither does.

### 3. The route never calls the mailer; it enqueues after commit

```ts
try {
  await getEmailQueue().add(
    "send-email",
    { outboxId: outbox.id },
    { ...EMAIL_JOB_RETRY_OPTIONS, deduplication: { id: outbox.id, keepLastIfActive: true } }
  );
} catch (err) {
  request.log.error(err, "Failed to enqueue email delivery job");
}
```

The enqueue call itself is wrapped in try/catch — a Redis hiccup at that instant shouldn't fail a request that already durably committed its real state; the reconciliation sweep (Decision 6) is the backstop for this specific case. Request latency is now bounded by one DB transaction plus one Redis command — no Brevo call anywhere in the path. This is the part that actually satisfies "a Brevo outage does not hold open account HTTP requests" (today's existing try/catch already stopped Brevo from *failing* the request, but never stopped it from *slowing* it).

### 4. Idempotent, bounded, retryable job processor

```ts
export async function processEmailOutbox(prisma: PrismaClient, outboxId: string): Promise<void> {
  const row = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: outboxId } });
  if (row.status === "SENT") return; // idempotency guard - see below

  try {
    const url = decrypt(row.payloadEncrypted!);
    const send = row.type === "VERIFICATION" ? sendVerificationEmail : sendPasswordResetEmail;
    await send(row.recipientEmail, url);
    await prisma.emailOutbox.update({
      where: { id: outboxId },
      data: { status: "SENT", sentAt: new Date(), payloadEncrypted: null },
    });
  } catch (err) {
    await prisma.emailOutbox.update({
      where: { id: outboxId },
      data: { status: "FAILED", attempts: { increment: 1 }, error: formatError(err) },
    });
    throw err; // let BullMQ's attempts/backoff retry
  }
}
```

`sendViaBrevoApi` in `mailer.ts` gains `signal: AbortSignal.timeout(10_000)` on its `fetch` call — the one concrete "no timeout today" gap named in the finding's own cited locations, and fixing it there benefits every caller, not just outbox-originated sends.

**Idempotency, and its actual limit, stated plainly**: checking `status === "SENT"` before sending eliminates duplicate sends in the ordinary retry case (a crash or requeue *before* the row updates). It does not eliminate the narrow race where Brevo confirms a send and the process crashes *between* that confirmation and the `SENT` update — BullMQ would retry and the guard wouldn't yet see `SENT`, so a duplicate send is possible in that specific window. This is accepted as a residual risk, not solved: Brevo's API isn't confirmed to offer an idempotency-key feature (not verified against live documentation in this session, so not assumed), and the consequence — a user occasionally receiving the same verification/reset link twice — has no security or correctness impact, since SEC-002 already makes token *consumption* single-use regardless of how many times the link was delivered.

**On failure, `FAILED` is set on every attempt, not just the last** — this makes each attempt observable via Bull Board immediately rather than only after retries are exhausted, and `attempts`/`error` accumulate the retry history. BullMQ's own retry then re-invokes the same processor; a still-`FAILED` (not `SENT`) row is retried normally.

### 5. Bull Board registration, reconciliation sweep

The new `email` queue is added to the existing `createBullBoard({ queues: [...] })` call in `index.ts` alongside `dictionary-build`/`maintenance` — no new route, no new auth guard, reuses the existing admin-gated dashboard entirely. This is what satisfies "delivery failures are observable and administratively recoverable" (criterion 3) with zero new UI.

A new repeatable job (`upsertJobScheduler`, same mechanism `sweep-changed-series` already uses, hourly cadence) queries `EmailOutbox` for `status: "PENDING"` rows older than a few minutes with no live job for their id, and re-enqueues them with the same `deduplication` key. This exists specifically for the case where Decision 3's enqueue try/catch actually fires (Redis was down at that instant) — without it, such a row would sit `PENDING` forever with nothing to pick it up, which would be a real "irrecoverable state mismatch" the acceptance criteria explicitly rule out.

## Risks / Trade-offs

- **[Risk]** The at-least-once delivery race described in Decision 4 (Brevo confirms, process crashes before `SENT` is recorded) can produce an occasional duplicate email. **Mitigation:** explicitly accepted — no security/correctness impact given SEC-002's single-use token consumption; not solvable without a confirmed Brevo-side idempotency mechanism, which isn't something this session verified exists.
- **[Risk]** `EmailOutbox` introduces a second place (beyond `PasswordResetToken`/`EmailVerificationToken`) where a decryptable form of an active token can transiently exist. **Mitigation:** encrypted at rest with the same key/mechanism already trusted for Turnstile secrets, and actively nulled on success — the exposure window is bounded to "queued but not yet successfully delivered," not indefinite.
- **[Trade-off]** This adds a third BullMQ queue, a new Prisma model, and a new reconciliation repeatable job — real additional moving parts for what was previously a single `await` with a try/catch. **Mitigation:** every piece reuses an established pattern already proven in this codebase (queue/worker shape, `deduplication`, `upsertJobScheduler`, Bull Board, `crypto.ts`) rather than introducing anything genuinely new to reason about.

## Migration Plan

1. Land the schema migration (additive), library/worker/queue changes, route changes, and tests together.
2. No operator action needed for the schema migration itself — it runs via the existing `prisma migrate deploy` pre-deploy gate (PROD-001/`add-migration-deployment-safety`).
3. No new environment variables — reuses `config.settingsEncryptionKey` (already required) and the existing Redis connection.

Rollback: revert the change. The three routes return to synchronous, try/catch-wrapped mailer calls; the `EmailOutbox` table and its rows become unused but are harmless to leave in place (or dropped in a follow-up migration if desired).
