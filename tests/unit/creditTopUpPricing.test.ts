import { describe, it, expect } from "vitest";
import {
  creditTopUpQuote,
  monthlyCreditGrant,
} from "../../lib/creditTopUpPricing";
describe("credit pack pricing", () => {
  it.each([
    [15, 149],
    [30, 249],
    [45, 349],
    [60, 449],
    [150, 1049],
    [1500, 10049],
  ])("prices %s credits at %s cents", (credits, price) =>
    expect(creditTopUpQuote(credits).amountCents).toBe(price),
  );
  it.each([0, 1, 14, 16, 29, -15, 15.5, NaN, Infinity, "15", null, 15000000])(
    "rejects invalid credits %s",
    (value) => expect(() => creditTopUpQuote(value)).toThrow(),
  );
  it("never removes over-cap balances during renewal", () => {
    expect(monthlyCreditGrant(500, 100, 200)).toBe(500);
    expect(monthlyCreditGrant(180, 100, 200)).toBe(200);
    expect(monthlyCreditGrant(20, 100, 200)).toBe(120);
  });
});
