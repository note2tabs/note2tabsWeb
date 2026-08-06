CREATE TABLE "GteDrumLoopState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "editorId" TEXT NOT NULL,
  "laneId" TEXT NOT NULL,
  "loops" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GteDrumLoopState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GteDrumLoopState_userId_editorId_laneId_key"
ON "GteDrumLoopState"("userId", "editorId", "laneId");

CREATE INDEX "GteDrumLoopState_editorId_laneId_idx"
ON "GteDrumLoopState"("editorId", "laneId");

CREATE INDEX "GteDrumLoopState_userId_updatedAt_idx"
ON "GteDrumLoopState"("userId", "updatedAt");

ALTER TABLE "GteDrumLoopState"
ADD CONSTRAINT "GteDrumLoopState_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
