CREATE TABLE "StripeRenewalInvoice" (
    "invoiceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "renewalAt" TIMESTAMP(3) NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeRenewalInvoice_pkey" PRIMARY KEY ("invoiceId")
);

CREATE INDEX "StripeRenewalInvoice_userId_renewalAt_idx"
ON "StripeRenewalInvoice"("userId", "renewalAt");

CREATE INDEX "StripeRenewalInvoice_stripeSubscriptionId_renewalAt_idx"
ON "StripeRenewalInvoice"("stripeSubscriptionId", "renewalAt");

ALTER TABLE "StripeRenewalInvoice"
ADD CONSTRAINT "StripeRenewalInvoice_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the one invoice ID recorded by the previous implementation so an
-- already-processed renewal cannot be replayed during rollout. Its chronology
-- is unknown, so it is recorded as processed but not used as the ordering cursor.
INSERT INTO "StripeRenewalInvoice" (
    "invoiceId",
    "userId",
    "stripeSubscriptionId",
    "renewalAt",
    "granted"
)
SELECT
    "lastStripeRenewalInvoiceId",
    "id",
    'legacy-unknown',
    COALESCE("updatedAt", CURRENT_TIMESTAMP),
    false
FROM "User"
WHERE "lastStripeRenewalInvoiceId" IS NOT NULL
ON CONFLICT ("invoiceId") DO NOTHING;
