import type { Prisma, PrismaClient } from "@prisma/client";
import { sendContactMessageEmail } from "./mailer.js";

function formatError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

/**
 * Creates a durable Contact form submission row. Takes a transaction client
 * so callers can create it in the same transaction as any other write the
 * submission belongs to - mirrors createOutboxEntry, but nothing here is a
 * single-use secret, so there's no encryption.
 */
export function createContactMessage(
  tx: Prisma.TransactionClient,
  data: { name: string; email: string; subject: string; message: string }
) {
  return tx.contactMessage.create({ data, select: { id: true } });
}

/**
 * Delivers one Contact form submission's email. Idempotent: a row already
 * SENT is a no-op, so a stray retry after a late crash never resends. On
 * failure, records the error and rethrows so BullMQ's own attempts/backoff
 * retries it.
 */
export async function processContactMessage(prisma: PrismaClient, contactMessageId: string): Promise<void> {
  const row = await prisma.contactMessage.findUniqueOrThrow({ where: { id: contactMessageId } });
  if (row.status === "SENT") return;

  try {
    await sendContactMessageEmail({
      name: row.name,
      email: row.email,
      subject: row.subject,
      message: row.message,
    });

    await prisma.contactMessage.update({
      where: { id: contactMessageId },
      data: { status: "SENT", sentAt: new Date() },
    });
  } catch (err: unknown) {
    await prisma.contactMessage.update({
      where: { id: contactMessageId },
      data: { status: "FAILED", attempts: { increment: 1 }, error: formatError(err) },
    });
    throw err;
  }
}
