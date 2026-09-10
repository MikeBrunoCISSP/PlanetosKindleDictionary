## Why

Admins have no proactive signal that something is waiting for review — they have to remember to open the admin dashboard to notice a pending registration or a pending entry/edit. A daily digest email closes that gap, and staying silent on days with nothing to review keeps it from becoming noise.

## What Changes

- A new daily scheduled job counts pending user registrations and pending review-queue items (new entry submissions plus edit proposals) and emails a summary to a configured recipient.
- The email is skipped entirely — no send at all — when both counts are zero.
- The schedule is configurable via a new `ADMIN_DIGEST_CRON` environment variable (same pattern as the existing `BUILD_CRON`), not hardcoded.
- A new `ADMIN_DIGEST_RECIPIENT_EMAIL` environment variable names the destination inbox, independent of the existing `CONTACT_RECIPIENT_EMAIL`.

## Capabilities

### New Capabilities
- `notifications/admin-digest`: the daily pending-work digest — what it counts, when it sends, when it stays silent, and where it's configured to go.

### Modified Capabilities
_None — this reads existing registration-approval and entry/edit-proposal state without changing either capability's own requirements._

## Impact

- `apps/api/src/config.ts`: new `ADMIN_DIGEST_CRON` (operational, defaulted like `BUILD_CRON`) and `ADMIN_DIGEST_RECIPIENT_EMAIL` (required in strict mode, validated like `CONTACT_RECIPIENT_EMAIL`, required for both the `api` and `worker` scopes since the worker is what actually sends mail).
- `apps/api/src/lib/adminDigest.ts` (new): counts pending users + pending review-queue items, and sends (or skips) the digest.
- `apps/api/src/lib/mailer.ts`: new `sendAdminDigestEmail(counts)`.
- `apps/api/src/worker.ts`: new repeatable `email`-queue job (`send-admin-digest`) registered via `upsertJobScheduler` on `config.adminDigestCron`.
- `apps/api/tests/`: new test coverage for the digest logic and the two new config values.
- `.env.example`, `infra/railway/README.md` / `BREVO.md`: document the two new variables, including setting them on both the `app` and `worker` Railway services.
