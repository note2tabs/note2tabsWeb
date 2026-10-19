import { describe, expect, it } from "vitest";
import { minimumPayoutMinor, parseReferenceRates, settledCommissionAmount } from "../../lib/affiliatePayoutPolicy";
const now = new Date("2026-10-20T12:00:00Z");
const xml = `<Cube time='2026-10-19'><Cube currency='USD' rate='1.1'/><Cube currency='SEK' rate='11'/><Cube currency='JPY' rate='165'/></Cube>`;
describe("minimum affiliate payout eligibility", () => {
  it("uses US$50 equivalent and respects zero-decimal currencies", () => {
    const rates = parseReferenceRates(xml, now);
    expect(minimumPayoutMinor("usd", rates)).toBe(5000);
    expect(minimumPayoutMinor("sek", rates)).toBe(50000);
    expect(minimumPayoutMinor("jpy", rates)).toBe(7500);
    expect(minimumPayoutMinor("eur", rates)).toBe(4546);
  });
  it.each(["", xml.replace("2026-10-19", "2026-10-01"), xml.replace("2026-10-19", "2026-10-21")])("holds money when rates are missing, stale or from the future", value => {
    expect(() => parseReferenceRates(value, now)).toThrow();
  });
  it("does not invent rates for unsupported currencies", () => {
    expect(() => minimumPayoutMinor("xyz", parseReferenceRates(xml, now))).toThrow();
  });
  it("converts the gross commission using actual Stripe settlement, without deducting processing fees", () => {
    expect(settledCommissionAmount({ grossAmount: 1000, commissionAmount: 200, currency: "eur" }, { amount: 1000, currency: "eur" }, { amount: 11000, currency: "sek" })).toBe(2200);
    expect(settledCommissionAmount({ grossAmount: 1000, commissionAmount: 200, currency: "usd" }, { amount: 1000, currency: "usd" }, { amount: 1541, currency: "jpy" })).toBe(308);
  });
  it("refuses mismatched charge amounts instead of paying a guessed conversion", () => {
    expect(() => settledCommissionAmount({ grossAmount: 1000, commissionAmount: 200, currency: "eur" }, { amount: 2000, currency: "eur" }, { amount: 11000, currency: "sek" })).toThrow();
  });
});
