import { describe, expect, it } from "vitest";
import { pricingMeasurementContext } from "../../lib/pricingMeasurement";
const base = { role: "FREE", plan: "FREE", signedIn: false, billingInterval: "yearly", displayCurrency: "SEK", userAgent: "Mozilla Mobile" };
describe("pricing measurement segmentation", () => {
  it("separates anonymous acquisition and preserves local billing context", () => {
    expect(pricingMeasurementContext(base)).toMatchObject({ pricing_layout_version: "pricing_cards_v1", pricing_audience: "acquisition", signedIn: false, display_currency: "sek", billing_interval: "yearly", device_type: "mobile" });
  });
  it("classifies Pro by plan even if the role is Free", () => {
    expect(pricingMeasurementContext({ ...base, plan: "PRO", signedIn: true })).toMatchObject({ pricing_audience: "existing_subscriber", current_plan: "pro" });
  });
  it("classifies legacy Premium roles as subscribers", () => {
    expect(pricingMeasurementContext({ ...base, role: "PREMIUM" }).pricing_audience).toBe("existing_subscriber");
  });
  it("keeps included staff access out of the acquisition funnel", () => {
    expect(pricingMeasurementContext({ ...base, role: "ADMIN", plan: "PRO" }).pricing_audience).toBe("staff");
  });
});
