CREATE TABLE "Affiliate" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "commissionPercent" INTEGER NOT NULL DEFAULT 20,
  "commissionMonths" INTEGER NOT NULL DEFAULT 6,
  "discountPercent" INTEGER NOT NULL DEFAULT 10,
  "discountMonths" INTEGER NOT NULL DEFAULT 3,
  "cookieDays" INTEGER NOT NULL DEFAULT 30,
  "payoutHoldDays" INTEGER NOT NULL DEFAULT 30,
  "stripeAccountId" TEXT,
  "stripeCouponId" TEXT,
  "stripePromotionCodeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateAttribution" (
  "id" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "referredUserId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'link',
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AffiliateAttribution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateCommission" (
  "id" TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "attributionId" TEXT NOT NULL,
  "stripeInvoiceId" TEXT NOT NULL,
  "stripeChargeId" TEXT,
  "stripeTransferId" TEXT,
  "paymentNumber" INTEGER NOT NULL,
  "grossAmount" INTEGER NOT NULL,
  "commissionAmount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "availableAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "reversedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AffiliateCommission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Affiliate_userId_key" ON "Affiliate"("userId");
CREATE UNIQUE INDEX "Affiliate_code_key" ON "Affiliate"("code");
CREATE UNIQUE INDEX "Affiliate_stripeAccountId_key" ON "Affiliate"("stripeAccountId");
CREATE UNIQUE INDEX "Affiliate_stripePromotionCodeId_key" ON "Affiliate"("stripePromotionCodeId");
CREATE INDEX "Affiliate_status_idx" ON "Affiliate"("status");
CREATE UNIQUE INDEX "AffiliateAttribution_referredUserId_key" ON "AffiliateAttribution"("referredUserId");
CREATE UNIQUE INDEX "AffiliateAttribution_stripeSubscriptionId_key" ON "AffiliateAttribution"("stripeSubscriptionId");
CREATE INDEX "AffiliateAttribution_affiliateId_createdAt_idx" ON "AffiliateAttribution"("affiliateId", "createdAt");
CREATE UNIQUE INDEX "AffiliateCommission_stripeInvoiceId_key" ON "AffiliateCommission"("stripeInvoiceId");
CREATE UNIQUE INDEX "AffiliateCommission_stripeTransferId_key" ON "AffiliateCommission"("stripeTransferId");
CREATE UNIQUE INDEX "AffiliateCommission_attributionId_paymentNumber_key" ON "AffiliateCommission"("attributionId", "paymentNumber");
CREATE INDEX "AffiliateCommission_status_availableAt_idx" ON "AffiliateCommission"("status", "availableAt");
CREATE INDEX "AffiliateCommission_affiliateId_createdAt_idx" ON "AffiliateCommission"("affiliateId", "createdAt");
CREATE INDEX "AffiliateCommission_stripeChargeId_idx" ON "AffiliateCommission"("stripeChargeId");
ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateAttribution" ADD CONSTRAINT "AffiliateAttribution_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AffiliateAttribution" ADD CONSTRAINT "AffiliateAttribution_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_attributionId_fkey" FOREIGN KEY ("attributionId") REFERENCES "AffiliateAttribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
