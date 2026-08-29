-- CreateIndex
CREATE INDEX "Build_seriesId_status_createdAt_idx" ON "Build"("seriesId", "status", "createdAt");
