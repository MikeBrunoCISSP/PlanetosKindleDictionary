## Why

`register`, `forgot-password`, and `resend-verification` still call Brevo
synchronously in the request path after mutating token/user records — a
prior change already stopped a delivery failure from failing the response,
but Brevo latency still adds to the request's wall-clock time (with no
timeout bound on the outbound call), and `forgot-password`/
`resend-verification` still invalidate the prior token before the
replacement has any durable record that a delivery attempt exists at all.
There is no persisted delivery state, so a failed send is invisible outside
logs and unrecoverable without one (finding PROD-006, medium severity).

## What Changes

- A new `EmailOutbox` table records each verification/reset email as a
  durable, encrypted-at-rest row, created in the **same transaction** as
  the token (and, for registration, the user) it belongs to — so a prior
  token is only ever invalidated together with a replacement that already
  has a durable outbox row, never before one exists.
- The three affected route handlers no longer call the mailer directly;
  they enqueue a BullMQ job referencing the outbox row after their
  transaction commits. Request latency is now bounded by a DB transaction
  and one Redis command — no external HTTP call in the request path.
- A new job processor sends the email (idempotently — a row already marked
  sent is never re-sent), bounded by an explicit timeout on the underlying
  Brevo call, with BullMQ's own retry/backoff on failure and deduplication
  against duplicate concurrent sends of the same row.
- The new `email` queue is registered with the existing Bull Board
  dashboard, giving admins the same failure visibility and manual-retry
  capability the two existing queues already have — no new admin UI.
- A lightweight hourly reconciliation job re-enqueues any outbox row left
  `PENDING` for more than a few minutes (covers the case where the enqueue
  call itself failed right after the transaction committed).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `notifications/email-delivery`: extends the existing "best-effort
  sending" requirement with durability — email is now queued via a durable
  outbox record and delivered asynchronously with bounded external-call
  duration, retry without duplicate sends, and administrative
  observability/recoverability for failed deliveries.
- `auth/login-registration`: registration, forgot-password, and
  resend-verification no longer invalidate a prior token before a durable
  delivery record exists for its replacement.

## Impact

- `apps/api/prisma/schema.prisma` — new `EmailOutbox` model + two enums;
  additive migration.
- `apps/api/src/lib/mailer.ts` — explicit timeout on the Brevo `fetch`.
- `apps/api/src/lib/outbox.ts` (new), `apps/api/src/lib/queues.ts`,
  `apps/api/src/worker.ts` — new queue, job processor, reconciliation job.
- `apps/api/src/routes/auth.ts` — `register`, `forgot-password`,
  `resend-verification` restructured; `reset-password`/`verify-email`
  (token consumption, already fixed under SEC-002) untouched.
- `apps/api/src/index.ts` — new queue registered with Bull Board.
- `apps/api/tests/authEmailResilience.test.ts` reworked; new tests for the
  job processor and for the token/outbox atomicity guarantee.
- Explicitly out of scope: `sendAccountApprovedEmail` and its admin-approval
  call site — not named in this finding, a different route.
