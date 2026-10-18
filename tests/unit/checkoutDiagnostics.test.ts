import { describe, it, expect, vi } from "vitest";
import {
  checkoutForPaymentIntent,
  checkoutPaymentDiagnostics,
  safeCheckoutPaymentDiagnostics,
} from "../../lib/checkoutDiagnostics";
function client() {
  return {
    checkout: { sessions: { list: vi.fn().mockResolvedValue({ data: [] }) } },
    subscriptions: { retrieve: vi.fn() },
    invoices: { retrieve: vi.fn() },
    paymentIntents: { retrieve: vi.fn() },
  };
}
describe("checkout diagnostics", () => {
  it("exports only payment categories and authentication outcomes", () => {
    const row = safeCheckoutPaymentDiagnostics({
      status: "succeeded",
      payment_method: {
        type: "card",
        billing_details: { email: "private@example.test" },
      },
      latest_charge: {
        payment_method_details: {
          type: "card",
          card: {
            last4: "4242",
            wallet: { type: "google_pay" },
            three_d_secure: {
              result: "authenticated",
              authentication_flow: "challenge",
            },
          },
        },
      },
      last_payment_error: { message: "private issuer text" },
    } as any);
    expect(row).toMatchObject({
      payment_method_type: "card",
      payment_wallet: "google_pay",
      authentication_result: "authenticated",
    });
    expect(JSON.stringify(row)).not.toMatch(/private|4242|billing_details/);
  });
  it("links a legacy subscription failure through its initial invoice", async () => {
    const s = client();
    s.invoices.retrieve.mockResolvedValue({
      billing_reason: "subscription_create",
      subscription: "sub_initial",
    });
    s.checkout.sessions.list
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ id: "cs_initial" }] });
    expect(
      await checkoutForPaymentIntent(
        s as any,
        { id: "pi", invoice: "in_initial" } as any,
      ),
    ).toEqual({ id: "cs_initial" });
    expect(s.checkout.sessions.list).toHaveBeenLastCalledWith({
      subscription: "sub_initial",
      limit: 1,
    });
  });
  it("never attributes renewal failures to the old acquiring checkout", async () => {
    const s = client();
    s.invoices.retrieve.mockResolvedValue({
      billing_reason: "subscription_cycle",
      subscription: "sub_old",
    });
    expect(
      await checkoutForPaymentIntent(
        s as any,
        { id: "pi", invoice: "in_renewal" } as any,
      ),
    ).toBeNull();
    expect(s.checkout.sessions.list).not.toHaveBeenCalled();
  });
  it("loads actual wallet details when subscription checkout has no direct intent", async () => {
    const s = client();
    s.subscriptions.retrieve.mockResolvedValue({
      latest_invoice: "in_initial",
    });
    s.invoices.retrieve.mockResolvedValue({ payment_intent: "pi_initial" });
    s.paymentIntents.retrieve.mockResolvedValue({
      status: "succeeded",
      latest_charge: {
        payment_method_details: {
          type: "card",
          card: { wallet: { type: "apple_pay" } },
        },
      },
    });
    expect(
      await checkoutPaymentDiagnostics(
        s as any,
        { subscription: "sub_initial", payment_intent: null } as any,
      ),
    ).toMatchObject({
      payment_wallet: "apple_pay",
      payment_method_type: "card",
    });
  });
  it("missing or unavailable diagnostics do not change fulfillment", async () => {
    const s = client();
    expect(await checkoutPaymentDiagnostics(s as any, {} as any)).toEqual({
      payment_diagnostics_available: false,
    });
    s.paymentIntents.retrieve.mockRejectedValue(
      new Error("Stripe temporarily unavailable"),
    );
    expect(
      await checkoutPaymentDiagnostics(
        s as any,
        { payment_intent: "pi" } as any,
      ),
    ).toEqual({ payment_diagnostics_available: false });
  });
});
