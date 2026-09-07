-- CreateIndex
CREATE INDEX "Entry_approvalStatus_createdAt_idx" ON "Entry"("approvalStatus", "createdAt");

-- CreateIndex
CREATE INDEX "User_approvalStatus_createdAt_idx" ON "User"("approvalStatus", "createdAt");
