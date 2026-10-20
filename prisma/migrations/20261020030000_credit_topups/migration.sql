-- user_credits is the existing authoritative backend wallet. No balance cap.
CREATE TABLE IF NOT EXISTS user_credits (
 "userId" TEXT PRIMARY KEY, credits INTEGER NOT NULL CHECK(credits>=0),
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE "CreditWalletState" ("userId" TEXT PRIMARY KEY,"freeMonth" TEXT NOT NULL);
CREATE TABLE "CreditTopUpOrder" (
 id TEXT PRIMARY KEY,"userId" TEXT NOT NULL,credits INTEGER NOT NULL CHECK(credits>0 AND credits%15=0),
 "amountCents" INTEGER NOT NULL CHECK("amountCents">=149),currency TEXT NOT NULL DEFAULT 'usd',
 "checkoutSessionId" TEXT UNIQUE,"paymentIntentId" TEXT UNIQUE,fulfilled BOOLEAN NOT NULL DEFAULT FALSE,
 "refundedCents" INTEGER NOT NULL DEFAULT 0,"revokedCredits" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"fulfilledAt" TIMESTAMP(3)
);
CREATE INDEX "CreditTopUpOrder_userId_createdAt_idx" ON "CreditTopUpOrder"("userId","createdAt");
