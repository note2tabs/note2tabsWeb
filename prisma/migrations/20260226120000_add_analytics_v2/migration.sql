-- CreateEnum
CREATE TYPE "AnalyticsConsentState" AS ENUM ('granted', 'denied');

-- CreateEnum
CREATE TYPE "AnalyticsIdentitySource" AS ENUM ('signup', 'login');

-- CreateTable
CREATE TABLE "AnalyticsConsentSubject" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT,
    "anonId" TEXT,
    "fingerprintHash" TEXT,
    "state" "AnalyticsConsentState" NOT NULL DEFAULT 'granted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnalyticsConsentSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsConsentAudit" (
    "id" BIGSERIAL NOT NULL,
    "subjectId" BIGINT NOT NULL,
    "state" "AnalyticsConsentState" NOT NULL,
    "source" TEXT,
    "metadata" JSONB,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalyticsConsentAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEventV2" (
    "id" BIGSERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "legacyEventName" TEXT,
    "ts" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT,
    "anonId" TEXT,
    "sessionId" TEXT,
    "fingerprintHash" TEXT,
    "consentSubjectId" BIGINT,
    "path" TEXT,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "ipHash" TEXT,
    "uaBrowser" TEXT,
    "uaOs" TEXT,
    "uaDevice" TEXT,
    "props" JSONB NOT NULL,
    "env" TEXT NOT NULL,
    "appVersion" TEXT,
    CONSTRAINT "AnalyticsEventV2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsIdentityLink" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "anonId" TEXT,
    "fingerprintHash" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "source" "AnalyticsIdentitySource" NOT NULL,
    CONSTRAINT "AnalyticsIdentityLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsGteSession" (
    "gteSessionId" UUID NOT NULL,
    "editorId" TEXT NOT NULL,
    "accountId" TEXT,
    "anonId" TEXT,
    "fingerprintHash" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "endReason" TEXT,
    "inferredStart" BOOLEAN NOT NULL DEFAULT false,
    "props" JSONB,
    "env" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnalyticsGteSession_pkey" PRIMARY KEY ("gteSessionId")
);

-- CreateTable
CREATE TABLE "AnalyticsDailyKpi" (
    "id" BIGSERIAL NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "env" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnalyticsDailyKpi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsConsentSubject_userId_key" ON "AnalyticsConsentSubject"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsConsentSubject_anonId_key" ON "AnalyticsConsentSubject"("anonId");

-- CreateIndex
CREATE INDEX "AnalyticsConsentSubject_fingerprintHash_idx" ON "AnalyticsConsentSubject"("fingerprintHash");

-- CreateIndex
CREATE INDEX "AnalyticsConsentAudit_subjectId_changedAt_idx" ON "AnalyticsConsentAudit"("subjectId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsEventV2_eventId_key" ON "AnalyticsEventV2"("eventId");

-- CreateIndex
CREATE INDEX "AnalyticsEventV2_ts_idx" ON "AnalyticsEventV2"("ts");

-- CreateIndex
CREATE INDEX "AnalyticsEventV2_name_ts_idx" ON "AnalyticsEventV2"("name", "ts");

-- CreateIndex
CREATE INDEX "AnalyticsEventV2_accountId_ts_idx" ON "AnalyticsEventV2"("accountId", "ts");

-- CreateIndex
CREATE INDEX "AnalyticsEventV2_anonId_ts_idx" ON "AnalyticsEventV2"("anonId", "ts");

-- CreateIndex
CREATE INDEX "AnalyticsEventV2_fingerprintHash_ts_idx" ON "AnalyticsEventV2"("fingerprintHash", "ts");

-- CreateIndex
CREATE INDEX "AnalyticsEventV2_path_ts_idx" ON "AnalyticsEventV2"("path", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsIdentityLink_userId_fingerprintHash_key" ON "AnalyticsIdentityLink"("userId", "fingerprintHash");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsIdentityLink_userId_anonId_key" ON "AnalyticsIdentityLink"("userId", "anonId");

-- CreateIndex
CREATE INDEX "AnalyticsIdentityLink_userId_idx" ON "AnalyticsIdentityLink"("userId");

-- CreateIndex
CREATE INDEX "AnalyticsIdentityLink_fingerprintHash_idx" ON "AnalyticsIdentityLink"("fingerprintHash");

-- CreateIndex
CREATE INDEX "AnalyticsIdentityLink_anonId_idx" ON "AnalyticsIdentityLink"("anonId");

-- CreateIndex
CREATE INDEX "AnalyticsIdentityLink_lastSeenAt_idx" ON "AnalyticsIdentityLink"("lastSeenAt");

-- CreateIndex
CREATE INDEX "AnalyticsGteSession_editorId_startedAt_idx" ON "AnalyticsGteSession"("editorId", "startedAt");

-- CreateIndex
CREATE INDEX "AnalyticsGteSession_accountId_startedAt_idx" ON "AnalyticsGteSession"("accountId", "startedAt");

-- CreateIndex
CREATE INDEX "AnalyticsGteSession_anonId_startedAt_idx" ON "AnalyticsGteSession"("anonId", "startedAt");

-- CreateIndex
CREATE INDEX "AnalyticsGteSession_fingerprintHash_startedAt_idx" ON "AnalyticsGteSession"("fingerprintHash", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDailyKpi_day_env_key" ON "AnalyticsDailyKpi"("day", "env");

-- CreateIndex
CREATE INDEX "AnalyticsDailyKpi_day_idx" ON "AnalyticsDailyKpi"("day");

-- AddForeignKey
ALTER TABLE "AnalyticsConsentAudit"
ADD CONSTRAINT "AnalyticsConsentAudit_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "AnalyticsConsentSubject"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEventV2"
ADD CONSTRAINT "AnalyticsEventV2_consentSubjectId_fkey"
FOREIGN KEY ("consentSubjectId") REFERENCES "AnalyticsConsentSubject"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Migration Notes:
-- 1) Phase 1 (dual-write): deploy this migration and keep ANALYTICS_V2_DUAL_WRITE=true.
-- 2) For very large datasets, consider monthly partitioning by ts:
--    CREATE TABLE analytics_event_v2_2026_03 PARTITION OF "AnalyticsEventV2"
--      FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
-- 3) Retention defaults:
--    raw tables: 180 days, rollups: 730 days.
