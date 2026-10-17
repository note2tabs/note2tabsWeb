import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import proxy from "../../proxy";
import { PRICE_TAX_NOTE_COOKIE, readPriceTaxNoteCookie } from "../../lib/priceTaxNote";

describe("price tax note visitor geography", () => {
  it.each(["/", "/pricing", "/fr/pricing"])("restricts %s to US/CA independently of currency and language", async path => {
    for (const country of ["US", "CA", "DE", "BR", "GB", "MX", "", "XX"]) {
      const headers: Record<string, string> = { cookie: "n2t_currency=USD; n2t_locale_chosen=1; n2t_locale=en" };
      if (country) headers["x-vercel-ip-country"] = country;
      const response = await proxy(new NextRequest(`https://www.note2tabs.com${path}`, { headers }));
      expect(response.cookies.get(PRICE_TAX_NOTE_COOKIE)?.value).toBe(country === "US" || country === "CA" ? "1" : "0");
    }
  });
  it("requires an exact positive audience cookie and hides unknown locations", () => {
    expect(readPriceTaxNoteCookie("n2t_currency=USD")).toBe(false);
    expect(readPriceTaxNoteCookie("n2t_tax_note=0")).toBe(false);
    expect(readPriceTaxNoteCookie("other_n2t_tax_note=1")).toBe(false);
    expect(readPriceTaxNoteCookie("n2t_currency=CAD; n2t_tax_note=1")).toBe(true);
  });
});
