CREATE TABLE "CreditResetNotice" (
 "id" TEXT PRIMARY KEY,
 "accountId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
 "source" TEXT NOT NULL,
 "availableAt" TIMESTAMPTZ NOT NULL,
 "expiresAt" TIMESTAMPTZ NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'pending',
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "sentAt" TIMESTAMPTZ
);
CREATE INDEX "CreditResetNotice_pending_idx" ON "CreditResetNotice" ("availableAt") WHERE status='pending';
