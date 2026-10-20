/** Amounts are integer Stripe currency minor units, including zero-decimal currencies. */
export function creditUpgradePrice(premiumAmount: number, proAmount: number, credits: number) {
  if (![premiumAmount, proAmount, credits].every(Number.isSafeInteger) || premiumAmount <= 0 || proAmount <= 0 || credits < 0) {
    throw new Error("Invalid upgrade valuation");
  }
  const discount = Math.min(proAmount, Math.round(credits * premiumAmount / 100));
  return { credits, discount, regularAmount: proAmount, dueNow: proAmount - discount };
}

/** Spending while a payment awaits authentication reduces the new allocation too. */
export function exchangedCreditBalance(current: number, exchanged: number) {
  return Math.max(0, current + 250 - exchanged);
}
