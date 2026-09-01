CREATE TABLE "GteActiveLane" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "laneId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GteActiveLane_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GteActiveLane_userId_editorId_key"
    ON "GteActiveLane"("userId", "editorId");
CREATE INDEX "GteActiveLane_editorId_idx"
    ON "GteActiveLane"("editorId");
CREATE INDEX "GteActiveLane_userId_updatedAt_idx"
    ON "GteActiveLane"("userId", "updatedAt");

ALTER TABLE "GteActiveLane"
    ADD CONSTRAINT "GteActiveLane_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
