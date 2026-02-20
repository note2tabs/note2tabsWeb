-- Add an explicit boolean verification flag.
ALTER TABLE "User"
ADD COLUMN "emailVerifiedBool" BOOLEAN NOT NULL DEFAULT false;

-- Preserve access for existing users created before verification enforcement.
UPDATE "User"
SET "emailVerifiedBool" = true;
