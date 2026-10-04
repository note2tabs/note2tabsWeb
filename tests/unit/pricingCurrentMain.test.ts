import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DISPLAY_CURRENCIES, formatLocalizedAmount, formatLocalizedPrice, localizedAnnualSaving, type DisplayCurrency } from "../../lib/localizedPricing";

const state = vi.hoisted(() => ({ currency: "USD" as string, billing: "monthly" as string }));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useState: (initial: unknown) => actual.useState(initial === "monthly" ? state.billing : initial) };
});
vi.mock("next/router", () => ({ useRouter: () => ({ query: {}, isReady: false }) }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "unauthenticated" }), signIn: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: any) => createElement("a", { href, ...props }, children) }));
vi.mock("../../lib/useDisplayCurrency", () => ({ useDisplayCurrency: () => state.currency }));
vi.mock("../../lib/usePremiumOfferExperiment", () => ({ usePremiumOfferExperiment: () => ({ variant: "control", resolved: true }) }));
vi.mock("../../lib/usePremiumOfferEligibility", () => ({ usePremiumOfferEligibility: () => "ineligible" }));
vi.mock("../../lib/analytics", () => ({ ANALYTICS_EVENTS: {}, sendEvent: vi.fn(), trackCtaClick: vi.fn() }));
vi.mock("../../components/SeoHead", () => ({ default: () => null, WEBSITE_ID: "website", absoluteUrl: (path: string) => `https://note2tabs.com${path}` }));
import PricingPage from "../../pages/pricing";

const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("'", "&#x27;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
describe("pricing design uses current offers and localized pricing", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_PRO_PLAN_ENABLED", "true"));
  afterEach(() => vi.unstubAllEnvs());
  it.each(DISPLAY_CURRENCIES)("renders %s prices and annual savings through the current currency system", (currency: DisplayCurrency) => {
    state.currency = currency;
    for (const interval of ["monthly", "yearly"] as const) {
      state.billing = interval;
      const html = renderToStaticMarkup(createElement(PricingPage));
      expect(html).toContain(escape(formatLocalizedPrice("PREMIUM", interval, currency)));
      expect(html).toContain(escape(formatLocalizedPrice("PRO", interval, currency)));
      expect(html).toContain(escape(formatLocalizedAmount(0, currency)));
      expect(html).toContain(`Save ${escape(localizedAnnualSaving("PRO", currency))} on Pro`);
      if (interval === "yearly") {
        expect(html).toContain(escape(localizedAnnualSaving("PREMIUM", currency)));
        expect(html).toContain(escape(localizedAnnualSaving("PRO", currency)));
      }
      expect(html).not.toMatch(/7.day|free trial|Payment method required|Choose the room/);
    }
  });
  it("hides Pro while preserving yearly selection when Pro is disabled", () => {
    vi.stubEnv("NEXT_PUBLIC_PRO_PLAN_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_PRO_PLAN_PREVIEW", "false");
    const html = renderToStaticMarkup(createElement(PricingPage));
    expect(html).not.toContain("pricing-plan--pro");
    expect(html).toContain("Yearly<span");
    expect(html).toContain(`Save ${escape(localizedAnnualSaving("PREMIUM", state.currency as DisplayCurrency))} on Premium`);
  });
  it("states current model access and keeps secondary information collapsed", () => {
    state.currency = "USD";
    state.billing = "monthly";
    const html = renderToStaticMarkup(createElement(PricingPage));
    const free = html.match(/<article class="pricing-plan pricing-plan--free">([\s\S]*?)<\/article>/)?.[1];
    expect(free).toContain("Light and Medium models");
    expect(free).not.toContain("Heavy");
    expect(html).toContain("4 credits with Light");
    expect(html).toContain("6 with Medium");
    expect(html).toContain("10 with Heavy");
    expect(html.match(/Credits refresh monthly/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]*\bopen/);
  });
});
