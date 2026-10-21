import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DISPLAY_CURRENCIES, formatLocalizedAmount, formatLocalizedPrice, localizedAnnualSaving, type DisplayCurrency } from "../../lib/localizedPricing";

const state = vi.hoisted(() => ({ currency: "USD" as string, billing: "monthly" as string, market: "standard" as string, session: null as any, query: {} as Record<string,string> }));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useState: (initial: unknown) => actual.useState(initial === "monthly" ? state.billing : initial) };
});
vi.mock("next/router", () => ({ useRouter: () => ({ query: state.query, isReady: false }) }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: state.session, status: state.session ? "authenticated" : "unauthenticated" }), signIn: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: any) => createElement("a", { href, ...props }, children) }));
vi.mock("../../lib/useDisplayCurrency", () => ({ useDisplayCurrency: () => state.currency, usePricingMarket: () => state.market }));
vi.mock("../../lib/usePremiumOfferExperiment", () => ({ usePremiumOfferExperiment: () => ({ variant: "control", resolved: true }) }));
vi.mock("../../lib/usePremiumOfferEligibility", () => ({ usePremiumOfferEligibility: () => "ineligible" }));
vi.mock("../../lib/analytics", () => ({ ANALYTICS_EVENTS: {}, sendEvent: vi.fn(), trackCtaClick: vi.fn() }));
vi.mock("../../components/SeoHead", () => ({ default: () => null, WEBSITE_ID: "website", absoluteUrl: (path: string) => `https://note2tabs.com${path}` }));
import PricingPage from "../../pages/pricing";
import WorkspaceSidebar from "../../components/WorkspaceSidebar";

const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("'", "&#x27;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
describe("pricing design uses current offers and localized pricing", () => {
  beforeEach(() => {state.query={};state.session=null;state.market="standard"; vi.stubEnv("NEXT_PUBLIC_PRO_PLAN_ENABLED", "true");});
  afterEach(() => vi.unstubAllEnvs());
  it("recommends Pro after a Pro-only limit rather than recommending an insufficient plan", () => {
    state.query = {plan: "pro", reason: "pro_file_size_limit"};
    const html = renderToStaticMarkup(createElement(PricingPage));
    const premium = html.split('pricing-plan--premium')[1].split('</article>')[0];
    const pro = html.split('pricing-plan--pro')[1].split('</article>')[0];
    expect(premium).not.toContain('Recommended');
    expect(pro).toContain('Recommended');
    expect(pro).toContain('pricing-plan__cta--upgrade');
    expect(html).toContain('pricing-page__plans--pro-recommended');
  });
  it("offers the Pro sidebar card to eligible Premium users only", () => {
    const props = {active: "home" as const, recentEditors: [], loading: false, isPremium: true, analyticsSurface: "product_home"};
    const premium = renderToStaticMarkup(createElement(WorkspaceSidebar, {...props, canUpgradeToPro: true}));
    expect(premium).toContain("250 monthly credits and larger uploads");
    expect(premium).toContain("reason=pro_upgrade");
    expect(renderToStaticMarkup(createElement(WorkspaceSidebar, props))).not.toContain("product-studio-sidebar__premium");
    const free = renderToStaticMarkup(createElement(WorkspaceSidebar, {...props, isPremium: false}));
    expect(free).toContain("More credits and full-song uploads");
  });
  it("shows paid members only Premium and Pro, including aligned comparison columns", () => {
    state.session = {user: {role: "PREMIUM", subscriptionPlan: "PREMIUM"}};
    const html = renderToStaticMarkup(createElement(PricingPage));
    expect(html).not.toContain('pricing-plan--free');
    expect(html).toContain('pricing-plan--premium');
    expect(html).toContain('pricing-plan--pro');
    expect(html).not.toContain('pricing-page__plans--three');
    expect(html).not.toContain('<th scope="col">Free</th>');
    expect(html).toContain('Manage current plan');
  });
  it("renders lower regional USD totals in cards, billing explanation and schema", () => {
    state.market="latam";state.currency="USD";state.billing="monthly";
    let html=renderToStaticMarkup(createElement(PricingPage));
    expect(html).toContain("$2.99");expect(html).toContain("$7.49");expect(html).not.toContain("$5.99");
    state.billing="yearly";html=renderToStaticMarkup(createElement(PricingPage));
    expect(html).toContain("$29.99");expect(html).toContain("$74.99");expect(html).toContain("Save $15!");
  });
  it.each(DISPLAY_CURRENCIES)("renders %s prices and annual savings through the current currency system", (currency: DisplayCurrency) => {
    state.currency = currency;
    for (const interval of ["monthly", "yearly"] as const) {
      state.billing = interval;
      const html = renderToStaticMarkup(createElement(PricingPage));
      expect(html).toContain(escape(formatLocalizedPrice("PREMIUM", interval, currency)));
      expect(html).toContain(escape(formatLocalizedPrice("PRO", interval, currency)));
      expect(html).toContain(escape(formatLocalizedAmount(0, currency)));
      expect(html).toContain(`Save ${escape(localizedAnnualSaving("PRO", currency))}!`);
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
    expect(html).toContain(`Save ${escape(localizedAnnualSaving("PREMIUM", state.currency as DisplayCurrency))}!`);
  });
  it("states current model access and keeps secondary information collapsed", () => {
    state.currency = "USD";
    state.billing = "monthly";
    const html = renderToStaticMarkup(createElement(PricingPage));
    const free = html.match(/<article class="pricing-plan pricing-plan--free">([\s\S]*?)<\/article>/)?.[1];
    expect(free).toContain("Light model");
    expect(free).not.toContain("Heavy");
    expect(html).toContain("4 credits with Light");
    expect(html).not.toContain("Medium");
    expect(html).toContain("10 with Heavy");
    expect(html.match(/Credits refresh monthly/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]*\bopen/);
  });
});
