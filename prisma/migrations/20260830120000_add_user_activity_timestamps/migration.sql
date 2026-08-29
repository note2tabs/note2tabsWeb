ALTER TABLE "User"
ADD COLUMN "lastLoginAt" TIMESTAMP(3),
ADD COLUMN "lastActiveAt" TIMESTAMP(3);

-- We have no trustworthy historical login or activity data, so use the
-- agreed baseline for every account that predates these columns.
UPDATE "User"
SET
  "lastLoginAt" = TIMESTAMP '2026-08-30 00:00:00',
  "lastActiveAt" = TIMESTAMP '2026-08-30 00:00:00';

ALTER TABLE "User"
ALTER COLUMN "lastLoginAt" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "lastLoginAt" SET NOT NULL,
ALTER COLUMN "lastActiveAt" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "lastActiveAt" SET NOT NULL;
