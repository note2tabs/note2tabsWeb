CREATE TABLE "EngagementSignal" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "at" TIMESTAMP(3) NOT NULL,
  "payload" JSONB NOT NULL
);
CREATE INDEX "EngagementSignal_accountId_at_idx" ON "EngagementSignal"("accountId", "at");
CREATE INDEX "EngagementSignal_at_idx" ON "EngagementSignal"("at");
CREATE TABLE "EngagementDecision" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "at" TIMESTAMP(3) NOT NULL,
  "channel" TEXT NOT NULL,
  "payload" JSONB NOT NULL
);
CREATE INDEX "EngagementDecision_accountId_at_idx" ON "EngagementDecision"("accountId", "at");
CREATE INDEX "EngagementDecision_at_idx" ON "EngagementDecision"("at");
