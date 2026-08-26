-- CreateEnum
CREATE TYPE "EntryApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "approvalStatus" "EntryApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "rejectionNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "submittedById" TEXT;

-- CreateTable
CREATE TABLE "SeriesWord" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "normalizedWord" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "inflectionId" TEXT,

    CONSTRAINT "SeriesWord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeriesWord_inflectionId_key" ON "SeriesWord"("inflectionId");

-- CreateIndex
CREATE UNIQUE INDEX "SeriesWord_seriesId_normalizedWord_key" ON "SeriesWord"("seriesId", "normalizedWord");

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesWord" ADD CONSTRAINT "SeriesWord_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesWord" ADD CONSTRAINT "SeriesWord_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesWord" ADD CONSTRAINT "SeriesWord_inflectionId_fkey" FOREIGN KEY ("inflectionId") REFERENCES "Inflection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
