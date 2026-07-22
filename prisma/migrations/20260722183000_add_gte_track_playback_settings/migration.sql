CREATE TABLE "GteTrackPlaybackSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "laneId" TEXT NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "isolated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GteTrackPlaybackSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GteTrackPlaybackSetting_userId_editorId_laneId_key"
    ON "GteTrackPlaybackSetting"("userId", "editorId", "laneId");
CREATE INDEX "GteTrackPlaybackSetting_editorId_laneId_idx"
    ON "GteTrackPlaybackSetting"("editorId", "laneId");
CREATE INDEX "GteTrackPlaybackSetting_userId_updatedAt_idx"
    ON "GteTrackPlaybackSetting"("userId", "updatedAt");

ALTER TABLE "GteTrackPlaybackSetting"
    ADD CONSTRAINT "GteTrackPlaybackSetting_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
