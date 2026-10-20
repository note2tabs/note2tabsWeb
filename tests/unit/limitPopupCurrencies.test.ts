import { describe, expect, it } from "vitest";
import { DISPLAY_CURRENCIES, localizedPriceAmount, formatLocalizedPrice } from "../../lib/localizedPricing";
import { ALL_LOCALES } from "../../lib/i18n/locale";
import { upgradeMoney } from "../../components/CreditUpgradeSummary";
import { creditUpgradePrice } from "../../lib/creditUpgradePricing";

describe("limit popup currency compatibility",()=>{
 for (const currency of DISPLAY_CURRENCIES) {
  it(`${currency}: every language, tier and upgrade balance`,()=>{
   const scale=["JPY","KRW"].includes(currency)?1:100;
   const premium=Math.round(localizedPriceAmount("PREMIUM","monthly",currency)*scale);
   const pro=Math.round(localizedPriceAmount("PRO","monthly",currency)*scale);
   for(const locale of ALL_LOCALES){
    for(const plan of ["PREMIUM","PRO"] as const) expect(formatLocalizedPrice(plan,"monthly",currency,locale)).not.toMatch(/NaN|undefined/);
    for(const credits of [0,3,50,100,200]){
     const quote={id:"test",currency,...creditUpgradePrice(premium,pro,credits,currency)};
     const expected=new Intl.NumberFormat(locale,{style:"currency",currency,minimumFractionDigits:scale===1?0:2,maximumFractionDigits:scale===1?0:2}).format(quote.dueNow/scale);
     expect(upgradeMoney(quote,quote.dueNow,locale)).toBe(expected);
     expect(quote.discount+quote.dueNow).toBe(pro);
     if(scale===1)expect(quote.dueNow).toBe(pro-Math.min(pro,Math.round(credits*premium/100)));
    }
   }
  });
 }
 it("retains reduced LatAm USD and independent BRL/MXN prices",()=>{
  expect(localizedPriceAmount("PRO","monthly","USD","latam")).toBe(7.49);
  expect(localizedPriceAmount("PRO","monthly","BRL","latam")).toBe(37.99);
  expect(localizedPriceAmount("PRO","monthly","MXN","latam")).toBe(219);
  const quote=creditUpgradePrice(299,749,200,"usd");
  expect(quote).toMatchObject({regularAmount:749,dueNow:149});
 });
});
