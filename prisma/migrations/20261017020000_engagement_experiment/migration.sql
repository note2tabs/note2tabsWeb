CREATE TABLE "EngagementEnrollment" (
  "accountId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "version" TEXT NOT NULL,
  "arm" TEXT NOT NULL CHECK ("arm" IN ('control','existing','contextual')),
  "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("accountId", "version")
);
CREATE TABLE "EngagementContact" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "version" TEXT NOT NULL,
  "arm" TEXT NOT NULL,
  "channel" TEXT NOT NULL CHECK ("channel" IN ('email','premium')),
  "action" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "EngagementContact_accountId_channel_createdAt_idx" ON "EngagementContact"("accountId","channel","createdAt");
CREATE TABLE "EngagementEmailPermission" (
  "accountId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "allowed" BOOLEAN NOT NULL DEFAULT FALSE,
  "basis" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
