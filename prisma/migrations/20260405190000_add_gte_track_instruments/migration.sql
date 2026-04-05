CREATE TABLE "GteTrackInstrument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "laneId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GteTrackInstrument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GteTrackInstrument_userId_editorId_laneId_key"
    ON "GteTrackInstrument"("userId", "editorId", "laneId");

CREATE INDEX "GteTrackInstrument_editorId_laneId_idx"
    ON "GteTrackInstrument"("editorId", "laneId");

CREATE INDEX "GteTrackInstrument_userId_updatedAt_idx"
    ON "GteTrackInstrument"("userId", "updatedAt");

ALTER TABLE "GteTrackInstrument"
    ADD CONSTRAINT "GteTrackInstrument_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
