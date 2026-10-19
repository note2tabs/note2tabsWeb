export const AFFILIATE_MINIMUM_PAYOUT_USD = 25;
export const AFFILIATE_BANK_PAYOUT_DAY = 28;
export const AFFILIATE_PAYOUT_NOTICE = "Eligible earnings are paid at most once per month after reaching US$25 equivalent. Smaller balances carry forward.";

// Stripe uses these currencies without decimal minor units.
const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);
export const minorUnits = (currency: string) => ZERO_DECIMAL.has(currency.toLowerCase()) ? 1 : ["bhd", "jod", "kwd", "omr", "tnd"].includes(currency.toLowerCase()) ? 1000 : 100;
export type ReferenceRates = { date: string; rates: Record<string, number> };

export function parseReferenceRates(xml: string, now = new Date()): ReferenceRates {
  const date = xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
  const age = date ? now.getTime() - Date.parse(date + "T00:00:00Z") : NaN;
  if (!Number.isFinite(age) || age < 0 || age > 7 * 86400000) throw new Error("Payout exchange rates are missing or stale");
  const rates: Record<string, number> = { EUR: 1 };
  for (const match of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) {
    const rate = Number(match[2]);
    if (Number.isFinite(rate) && rate > 0) rates[match[1]] = rate;
  }
  if (!rates.USD) throw new Error("Payout USD reference rate unavailable");
  return { date: date!, rates };
}
export async function loadPayoutRates(now = new Date()) {
  const response = await fetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Payout reference rates unavailable");
  return parseReferenceRates(await response.text(), now);
}
export function minimumPayoutMinor(currency: string, reference: ReferenceRates) {
  const rate = reference.rates[currency.toUpperCase()];
  if (!rate || !reference.rates.USD) throw new Error("Unsupported payout settlement currency");
  // Decimal reference rates are rational numbers. Integer arithmetic avoids
  // a floating-point residue rounding an exact threshold up by one minor unit.
  const fraction = (value: number) => {
    const [whole, decimals = ""] = value.toString().split(".");
    if (!/^\d+$/.test(whole) || !/^\d*$/.test(decimals)) throw new Error("Invalid payout reference rate");
    return { numerator: BigInt(whole + decimals), denominator: BigInt(10) ** BigInt(decimals.length) };
  };
  const from = fraction(rate), usd = fraction(reference.rates.USD);
  const numerator = BigInt(AFFILIATE_MINIMUM_PAYOUT_USD * minorUnits(currency)) * from.numerator * usd.denominator;
  const denominator = from.denominator * usd.numerator;
  const result = Number((numerator + denominator - BigInt(1)) / denominator);
  if (!Number.isSafeInteger(result)) throw new Error("Payout threshold exceeds safe amount");
  return result;
}

/** Allocate the agreed gross commission using the actual charge settlement,
 * never subtract payment processing fees from the affiliate's commission. */
export function settledCommissionAmount(commission: { grossAmount: number; commissionAmount: number; currency: string }, charge: { amount: number; currency: string }, settlement: { amount: number; currency: string }) {
  if (commission.currency.toLowerCase() !== charge.currency.toLowerCase() || commission.grossAmount !== charge.amount ||
      !Number.isSafeInteger(commission.commissionAmount) || commission.commissionAmount <= 0 || commission.commissionAmount > commission.grossAmount || settlement.amount <= 0) {
    throw new Error("Commission charge settlement mismatch");
  }
  if (!Number.isSafeInteger(settlement.amount) || !Number.isSafeInteger(charge.amount) || !Number.isSafeInteger(commission.grossAmount)) throw new Error("Invalid settlement amount");
  return Number(BigInt(settlement.amount) * BigInt(commission.commissionAmount) / BigInt(charge.amount));
}
