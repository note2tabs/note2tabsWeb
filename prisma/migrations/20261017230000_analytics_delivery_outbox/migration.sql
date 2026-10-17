CREATE TABLE "AnalyticsDeliveryOutbox" (
  "id" TEXT PRIMARY KEY,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deliveredAt" TIMESTAMPTZ
);
CREATE INDEX "AnalyticsDeliveryOutbox_pending" ON "AnalyticsDeliveryOutbox" ("createdAt") WHERE "deliveredAt" IS NULL;
CREATE INDEX "AnalyticsDeliveryOutbox_delivered" ON "AnalyticsDeliveryOutbox" ("deliveredAt") WHERE "deliveredAt" IS NOT NULL;
