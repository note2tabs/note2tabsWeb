import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { creditUpgradePrice, exchangedCreditBalance } from "../../lib/creditUpgradePricing";
describe("credit-based Pro upgrade", () => {
  it.each([[0,0,1499],[50,300,1199],[100,599,900],[200,1198,301],[300,1499,0]])("values %i credits including rollover", (credits, discount, dueNow) => {
    expect(creditUpgradePrice(599,1499,credits)).toMatchObject({discount,dueNow});
  });
  it("uses actual local and legacy amounts, without assuming USD cents", () => {
    expect(creditUpgradePrice(1499,3999,200).dueNow).toBe(1001);
    expect(creditUpgradePrice(600,1500,50).dueNow).toBe(1200);
  });
  it.each([-1,NaN,Infinity,0.5])("rejects invalid balances %s", credits => expect(()=>creditUpgradePrice(599,1499,credits)).toThrow());
  it("exchanges the old balance and adjusts for credits spent awaiting payment", () => {
    expect(exchangedCreditBalance(200,200)).toBe(250);
    expect(exchangedCreditBalance(170,200)).toBe(220);
    expect(exchangedCreditBalance(0,0)).toBe(250);
  });
});

describe("upgrade review localization", () => {
  it("has every review message in all ten catalogs with matching placeholders", () => {
    const source = readFileSync("components/CreditUpgradeReview.tsx", "utf8") + readFileSync("components/CreditUpgradeSummary.tsx", "utf8");
    const keys = Array.from(source.matchAll(/t\("([^"]+)"/g), match => match[1]);
    for (const locale of ["en","fr","it","es","pt-BR","pl","ja","ko","zh-Hans","ar"]) {
      const catalog = JSON.parse(readFileSync(`lib/i18n/${locale}.json`, "utf8"));
      for (const key of keys) {
        expect(catalog[key], `${locale}: ${key}`).toBeTruthy();
        expect((catalog[key].match(/\{[^}]+\}/g) || []).sort()).toEqual((key.match(/\{[^}]+\}/g) || []).sort());
      }
    }
  });
});
