import { describe, expect, it } from "vitest";
import {
  DISPLAY_CURRENCIES,
  displayCurrencyForCountry,
  formatLocalizedPrice,
  localizedAnnualSaving,
  localizedPriceAmount,
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
    expect(formatLocalizedPrice("PREMIUM", "monthly", "CAD")).toBe("CA$8.99");
    expect(formatLocalizedPrice("PRO", "monthly", "AUD")).toBe("A$21.99");
    expect(formatLocalizedPrice("PREMIUM", "yearly", "NZD")).toBe("NZ$109.99");
    expect(formatLocalizedPrice("PREMIUM", "monthly", "CHF")).toBe("CHF 4.99");
    expect(formatLocalizedPrice("PRO", "monthly", "NOK")).toBe("149 kr");
    expect(formatLocalizedPrice("PREMIUM", "monthly", "DKK")).toBe("39 kr");
    expect(formatLocalizedPrice("PREMIUM", "monthly", "JPY")).toBe("¥999");
    expect(formatLocalizedPrice("PRO", "monthly", "SGD")).toBe("S$20.99");
    expect(localizedAnnualSaving("PREMIUM", "GBP")).toBe("£10");
  });

  it("never prices non-psychological localized plans below their USD equivalent", () => {
    // ECB reference rates published 2026-10-02, converted from EUR crosses.
    const usdPerEuro = 1.1225;
    const currencyPerEuro = {
      USD: usdPerEuro,
      GBP: 0.85033,
      EUR: 1,
      SEK: 11.29,
      CAD: 1.5984,
      AUD: 1.6176,
      NZD: 2.0002,
      CHF: 0.9279,
      NOK: 10.8315,
      DKK: 7.4736,
      JPY: 176.99,
      SGD: 1.4366,
    } as const;

    for (const plan of ["PREMIUM", "PRO"] as const) {
      for (const interval of ["monthly", "yearly"] as const) {
        const usdAmount = localizedPriceAmount(plan, interval, "USD");
        for (const currency of DISPLAY_CURRENCIES.filter(
          (candidate) => candidate !== "SEK" && candidate !== "DKK"
        )) {
          const usdEquivalent = usdAmount * currencyPerEuro[currency] / usdPerEuro;
          expect(
            localizedPriceAmount(plan, interval, currency) + Number.EPSILON * 100,
            `${plan} ${interval} ${currency}`
          ).toBeGreaterThanOrEqual(usdEquivalent);
        }
      }
    }
  });

  it("uses ending-in-9 commercial prices for SEK and DKK", () => {
    for (const plan of ["PREMIUM", "PRO"] as const) {
      for (const interval of ["monthly", "yearly"] as const) {
        for (const currency of ["SEK", "DKK"] as const) {
          expect(String(localizedPriceAmount(plan, interval, currency))).toMatch(/9$/);
        }
      }
    }
  });

  it("falls back safely when the cookie is absent or invalid", () => {
    expect(readDisplayCurrencyCookie("analytics_consent=granted; n2t_currency=SEK")).toBe("SEK");
    expect(readDisplayCurrencyCookie("n2t_currency=CAD")).toBe("CAD");
    expect(readDisplayCurrencyCookie("n2t_currency=JPY")).toBe("JPY");
    expect(readDisplayCurrencyCookie("n2t_currency=invalid")).toBe("USD");
    expect(readDisplayCurrencyCookie("")).toBe("USD");
  });
});
