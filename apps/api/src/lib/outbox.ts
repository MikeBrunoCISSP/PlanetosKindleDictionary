import type { Prisma, PrismaClient } from "@prisma/client";
import type { JobsOptions } from "bullmq";
import { encrypt, decrypt } from "./crypto.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "./mailer.js";

// Matches sweep.ts's BUILD_JOB_RETRY_OPTIONS shape - 3 retries, exponential
// backoff. deduplication (set at each enqueue call site, not here, since it
// needs the specific outbox row's id) prevents duplicate-in-flight sends of
// the same row without permanently blocking a later legitimate retry.
export const EMAIL_JOB_RETRY_OPTIONS: Pick<JobsOptions, "attempts" | "backoff"> = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
};

function formatError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

export type EmailOutboxType = "VERIFICATION" | "PASSWORD_RESET";

/**
 * Creates a durable, encrypted-at-rest outbox row for an account email
 * (PROD-006). Takes a transaction client so callers can create it in the
 * same transaction as the token/user mutation it belongs to - the row must
 * exist durably before a prior token is ever invalidated, and it must exist
 * before the row's id is enqueued as a job (which happens after commit).
 */
export function createOutboxEntry(
  tx: Prisma.TransactionClient,
  type: EmailOutboxType,
  recipientEmail: string,
  url: string
) {
  return tx.emailOutbox.create({
    data: { type, recipientEmail, payloadEncrypted: encrypt(url) },
    select: { id: true },
  });
}

/**
 * Delivers one outbox row's email. Idempotent: a row already SENT is a
 * no-op, so a stray retry after a late crash (Brevo confirmed, but the
 * status update didn't land before the process died) never resends. On
 * success, clears the encrypted payload - it's no longer needed once
 * delivered, and it embeds an active single-use token. On failure, records
 * the error and rethrows so BullMQ's own attempts/backoff retries it.
 */
export async function processEmailOutbox(prisma: PrismaClient, outboxId: string): Promise<void> {
  const row = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: outboxId } });
  if (row.status === "SENT") return;

  try {
    const url = decrypt(row.payloadEncrypted!);
    const send = row.type === "VERIFICATION" ? sendVerificationEmail : sendPasswordResetEmail;
    await send(row.recipientEmail, url);

    await prisma.emailOutbox.update({
      where: { id: outboxId },
      data: { status: "SENT", sentAt: new Date(), payloadEncrypted: null },
    });
  } catch (err: unknown) {
    await prisma.emailOutbox.update({
      where: { id: outboxId },
      data: { status: "FAILED", attempts: { increment: 1 }, error: formatError(err) },
    });
    throw err;
  }
}
