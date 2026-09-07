-- AlterTable
ALTER TABLE "Series" ADD COLUMN     "dirtySince" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Series_dirtySince_idx" ON "Series"("dirtySince");
