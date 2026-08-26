-- CreateEnum
CREATE TYPE "EntryEditProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "EntryEditProposal" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "proposedDefinitionHtml" TEXT NOT NULL,
    "status" "EntryEditProposalStatus" NOT NULL DEFAULT 'PENDING',
    "submittedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "baseEntryUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntryEditProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryEditProposalInflection" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "EntryEditProposalInflection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntryEditProposal_status_createdAt_idx" ON "EntryEditProposal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EntryEditProposal_entryId_idx" ON "EntryEditProposal"("entryId");

-- CreateIndex
CREATE INDEX "EntryEditProposalInflection_proposalId_idx" ON "EntryEditProposalInflection"("proposalId");

-- AddForeignKey
ALTER TABLE "EntryEditProposal" ADD CONSTRAINT "EntryEditProposal_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryEditProposal" ADD CONSTRAINT "EntryEditProposal_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryEditProposal" ADD CONSTRAINT "EntryEditProposal_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryEditProposalInflection" ADD CONSTRAINT "EntryEditProposalInflection_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "EntryEditProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-appended: Prisma's schema DSL has no partial/conditional unique index
-- syntax, so this enforces "at most one PENDING edit proposal per entry" at
-- the database level (application-level pre-check is the friendly-message
-- path; this index is the concurrency backstop, caught as P2002).
CREATE UNIQUE INDEX "EntryEditProposal_entryId_pending_unique"
  ON "EntryEditProposal" ("entryId")
  WHERE "status" = 'PENDING';
