import type { PrismaClient } from "@prisma/client";
import { sendAdminDigestEmail } from "./mailer.js";

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
