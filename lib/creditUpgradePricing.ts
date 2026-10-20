/** Amounts are integer Stripe currency minor units, including zero-decimal currencies. */
export function creditUpgradePrice(premiumAmount: number, proAmount: number, credits: number, currency?: string) {
  if (![premiumAmount, proAmount, credits].every(Number.isSafeInteger) || premiumAmount <= 0 || proAmount <= 0 || credits < 0) {
    throw new Error("Invalid upgrade valuation");
  }
  const creditDiscount = Math.min(proAmount, Math.round(credits * premiumAmount / 100));
  const exactDue = proAmount - creditDiscount;
  // Two-decimal currencies only. Nearest x.x9; ties round upward.
  // Never charge more than the regular Pro price or turn zero into a charge.
  const twoDecimal = currency && new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits === 2;
  const dueNow = twoDecimal && exactDue > 0
    ? Math.min(proAmount, Math.max(0, Math.round((exactDue - 9) / 10) * 10 + 9))
    : exactDue;
  const discount = proAmount - dueNow;
  return { credits, discount, regularAmount: proAmount, dueNow };
}

/** Spending while a payment awaits authentication reduces the new allocation too. */
export function exchangedCreditBalance(current: number, exchanged: number) {
  return Math.max(0, current + 250 - exchanged);
}
