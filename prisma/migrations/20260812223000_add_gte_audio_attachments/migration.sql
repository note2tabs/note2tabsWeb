CREATE TABLE "GteAudioAttachment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "sourceJobId" TEXT NOT NULL,
    "timelineOffsetFrames" INTEGER NOT NULL DEFAULT 0,
    "clipOffsetSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GteAudioAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GteAudioAttachment_userId_editorId_key"
ON "GteAudioAttachment"("userId", "editorId");

CREATE INDEX "GteAudioAttachment_userId_sourceJobId_idx"
ON "GteAudioAttachment"("userId", "sourceJobId");

ALTER TABLE "GteAudioAttachment"
ADD CONSTRAINT "GteAudioAttachment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
