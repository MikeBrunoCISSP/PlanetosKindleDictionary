-- Rename displayName -> username (preserves data and the existing unique
-- constraint; only the index name is cosmetic-renamed to match).
ALTER TABLE "User" RENAME COLUMN "displayName" TO "username";
ALTER INDEX "User_displayName_key" RENAME TO "User_username_key";

-- Case-insensitive username uniqueness via a normalized shadow column
-- (mirrors SeriesWord.normalizedWord). Backfilled defensively: if any
-- pre-existing usernames collide only in case, all but the
-- earliest-created row get a numeric suffix rather than failing the
-- migration outright (usernames are not identity-bearing the way email
-- is, so a defensive rename is acceptable here).
ALTER TABLE "User" ADD COLUMN "usernameNormalized" TEXT;

WITH ranked AS (
  SELECT
    "id",
    LOWER(TRIM("username")) AS base_normalized,
    ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM("username")) ORDER BY "createdAt" ASC) AS rn
  FROM "User"
)
UPDATE "User" u
SET "usernameNormalized" = CASE
  WHEN r.rn = 1 THEN r.base_normalized
  ELSE r.base_normalized || '-' || r.rn::text
END
FROM ranked r
WHERE u."id" = r."id";

ALTER TABLE "User" ALTER COLUMN "usernameNormalized" SET NOT NULL;
CREATE UNIQUE INDEX "User_usernameNormalized_key" ON "User"("usernameNormalized");

-- Case-insensitive email uniqueness: normalize the stored value itself
-- (no shadow column needed - unlike username, email casing is never
-- meaningfully displayed). Email is identity-bearing, so unlike
-- username above, this fails loudly rather than silently renaming
-- anything if lowercasing would collide two existing accounts.
DO $$
DECLARE
  collision_count INT;
BEGIN
  SELECT COUNT(*) INTO collision_count
  FROM (
    SELECT LOWER("email") AS le
    FROM "User"
    GROUP BY LOWER("email")
    HAVING COUNT(*) > 1
  ) dupes;

  IF collision_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % email address(es) collide when lowercased. Resolve the conflicting accounts manually before re-running this migration.', collision_count;
  END IF;
END $$;

UPDATE "User" SET "email" = LOWER("email");

-- Reason for Joining - nullable, no backfill for pre-existing accounts
ALTER TABLE "User" ADD COLUMN "reasonForJoining" TEXT;

-- User approval workflow. New rows default to PENDING; every row that
-- exists at migration time is explicitly backfilled to APPROVED so the
-- default only ever applies to genuinely new registrations.
CREATE TYPE "UserApprovalStatus" AS ENUM ('PENDING', 'APPROVED');
ALTER TABLE "User" ADD COLUMN "approvalStatus" "UserApprovalStatus" NOT NULL DEFAULT 'PENDING';
UPDATE "User" SET "approvalStatus" = 'APPROVED';

-- Turnstile settings singleton (enabled defaults to false so a fresh
-- deploy never locks out registration before an admin configures real
-- credentials).
CREATE TABLE "TurnstileSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "siteKey" TEXT,
    "secretKeyEncrypted" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "TurnstileSettings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TurnstileSettings" ADD CONSTRAINT "TurnstileSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
