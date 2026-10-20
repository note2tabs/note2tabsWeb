CREATE TABLE "CreditUpgrade" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "subscriptionId" TEXT NOT NULL,
 "oldPeriodStart" INTEGER NOT NULL, "oldInvoiceId" TEXT NOT NULL, "priceId" TEXT NOT NULL, "currency" TEXT NOT NULL,
 "credits" INTEGER NOT NULL CHECK ("credits" >= 0), "discount" INTEGER NOT NULL CHECK ("discount" >= 0),
 "regularAmount" INTEGER NOT NULL CHECK ("regularAmount" >= "discount"),
 "invoiceId" TEXT, "appliedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CreditUpgrade_subscriptionId_oldPeriodStart_key" ON "CreditUpgrade"("subscriptionId", "oldPeriodStart");
CREATE UNIQUE INDEX "CreditUpgrade_invoiceId_key" ON "CreditUpgrade"("invoiceId");
