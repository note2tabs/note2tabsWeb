import { describe, expect, it } from "vitest";
import {
  displayCurrencyForCountry,
  formatLocalizedPrice,
  localizedAnnualSaving,
  readDisplayCurrencyCookie,
} from "../../lib/localizedPricing";

describe("localized pricing", () => {
  it("maps supported checkout regions without retaining an IP address", () => {
    expect(displayCurrencyForCountry("GB")).toBe("GBP");
    expect(displayCurrencyForCountry("SE")).toBe("SEK");
    expect(displayCurrencyForCountry("DE")).toBe("EUR");
    expect(displayCurrencyForCountry("CA")).toBe("USD");
  });

  it("matches the configured Stripe price options", () => {
    expect(formatLocalizedPrice("PREMIUM", "monthly", "GBP")).toBe("£4.99");
    expect(formatLocalizedPrice("PRO", "yearly", "EUR")).toBe("€139.99");
    expect(formatLocalizedPrice("PRO", "monthly", "SEK")).toBe("149 kr");
    expect(localizedAnnualSaving("PREMIUM", "GBP")).toBe("£10");
  });

  it("falls back safely when the cookie is absent or invalid", () => {
    expect(readDisplayCurrencyCookie("analytics_consent=granted; n2t_currency=SEK")).toBe("SEK");
    expect(readDisplayCurrencyCookie("n2t_currency=CAD")).toBe("USD");
    expect(readDisplayCurrencyCookie("")).toBe("USD");
  });
});
