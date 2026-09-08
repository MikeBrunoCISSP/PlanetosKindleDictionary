-- CreateEnum
CREATE TYPE "StorageCleanupReason" AS ENUM ('BUILD_FAILED', 'SERIES_DELETED');

-- CreateTable
CREATE TABLE "PendingStorageCleanup" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "reason" "StorageCleanupReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "PendingStorageCleanup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingStorageCleanup_createdAt_idx" ON "PendingStorageCleanup"("createdAt");
