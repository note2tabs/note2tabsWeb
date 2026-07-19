CREATE TABLE "FeedbackSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "message" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "pagePath" TEXT NOT NULL DEFAULT '/feedback',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedbackSubmission_createdAt_idx"
ON "FeedbackSubmission"("createdAt");

CREATE INDEX "FeedbackSubmission_userId_createdAt_idx"
ON "FeedbackSubmission"("userId", "createdAt");

ALTER TABLE "FeedbackSubmission"
ADD CONSTRAINT "FeedbackSubmission_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
