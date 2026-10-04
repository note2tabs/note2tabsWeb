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
    expect(displayCurrencyForCountry("CA")).toBe("CAD");
    expect(displayCurrencyForCountry("AU")).toBe("AUD");
    expect(displayCurrencyForCountry("NZ")).toBe("NZD");
    expect(displayCurrencyForCountry("CH")).toBe("CHF");
    expect(displayCurrencyForCountry("NO")).toBe("NOK");
    expect(displayCurrencyForCountry("DK")).toBe("DKK");
    expect(displayCurrencyForCountry("JP")).toBe("JPY");
    expect(displayCurrencyForCountry("SG")).toBe("SGD");
    expect(displayCurrencyForCountry("BR")).toBe("USD");
  });

  it("matches the configured Stripe price options", () => {
    expect(formatLocalizedPrice("PREMIUM", "monthly", "GBP")).toBe("£4.99");
    expect(formatLocalizedPrice("PRO", "yearly", "EUR")).toBe("€139.99");
    expect(formatLocalizedPrice("PRO", "monthly", "SEK")).toBe("149 kr");
    expect(formatLocalizedPrice("PREMIUM", "monthly", "CAD")).toBe("CA$8.49");
    expect(formatLocalizedPrice("PRO", "monthly", "AUD")).toBe("A$21.99");
    expect(formatLocalizedPrice("PREMIUM", "yearly", "NZD")).toBe("NZ$109.99");
    expect(formatLocalizedPrice("PREMIUM", "monthly", "CHF")).toBe("CHF 4.99");
    expect(formatLocalizedPrice("PRO", "monthly", "NOK")).toBe("149 kr");
    expect(formatLocalizedPrice("PREMIUM", "monthly", "DKK")).toBe("39 kr");
    expect(formatLocalizedPrice("PREMIUM", "monthly", "JPY")).toBe("¥949");
    expect(formatLocalizedPrice("PRO", "monthly", "SGD")).toBe("S$19.99");
    expect(localizedAnnualSaving("PREMIUM", "GBP")).toBe("£10");
  });

  it("falls back safely when the cookie is absent or invalid", () => {
    expect(readDisplayCurrencyCookie("analytics_consent=granted; n2t_currency=SEK")).toBe("SEK");
    expect(readDisplayCurrencyCookie("n2t_currency=CAD")).toBe("CAD");
    expect(readDisplayCurrencyCookie("n2t_currency=JPY")).toBe("JPY");
    expect(readDisplayCurrencyCookie("n2t_currency=invalid")).toBe("USD");
    expect(readDisplayCurrencyCookie("")).toBe("USD");
  });
});
