CREATE TABLE "GteEditorInputSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "defaultNoteLengthDenominator" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "cursorSizeDenominator" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GteEditorInputSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GteEditorInputSetting_userId_editorId_key"
    ON "GteEditorInputSetting"("userId", "editorId");
CREATE INDEX "GteEditorInputSetting_editorId_idx"
    ON "GteEditorInputSetting"("editorId");
CREATE INDEX "GteEditorInputSetting_userId_updatedAt_idx"
    ON "GteEditorInputSetting"("userId", "updatedAt");

ALTER TABLE "GteEditorInputSetting"
    ADD CONSTRAINT "GteEditorInputSetting_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
