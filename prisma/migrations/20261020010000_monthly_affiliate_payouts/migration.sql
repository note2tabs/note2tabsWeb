CREATE TABLE "AffiliatePayout" (
  "id" TEXT PRIMARY KEY,
  "affiliateId" TEXT NOT NULL REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "month" TEXT NOT NULL,
  "amount" INTEGER NOT NULL CHECK ("amount" > 0),
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "stripeTransferId" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "transferredAt" TIMESTAMP(3),
  UNIQUE ("affiliateId", "month")
);
ALTER TABLE "AffiliateCommission" ADD COLUMN "payoutId" TEXT REFERENCES "AffiliatePayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AffiliateCommission" ADD COLUMN "payoutAmount" INTEGER;
CREATE INDEX "AffiliateCommission_payoutId_idx" ON "AffiliateCommission"("payoutId");
