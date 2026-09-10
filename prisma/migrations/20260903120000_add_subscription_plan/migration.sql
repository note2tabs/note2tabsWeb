ALTER TABLE "User" ADD COLUMN "subscriptionPlan" TEXT NOT NULL DEFAULT 'FREE';

UPDATE "User"
SET "subscriptionPlan" = 'PREMIUM'
WHERE "role" = 'PREMIUM';

ALTER TABLE "User"
ADD CONSTRAINT "User_subscriptionPlan_check"
CHECK ("subscriptionPlan" IN ('FREE', 'PREMIUM', 'PRO'));
