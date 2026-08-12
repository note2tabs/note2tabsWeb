CREATE TABLE "TabEmbedShare" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TabEmbedShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TabEmbedShare_tokenHash_key"
ON "TabEmbedShare"("tokenHash");

CREATE INDEX "TabEmbedShare_userId_editorId_revokedAt_idx"
ON "TabEmbedShare"("userId", "editorId", "revokedAt");

ALTER TABLE "TabEmbedShare"
ADD CONSTRAINT "TabEmbedShare_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
