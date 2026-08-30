import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const { stripeMock, prismaMock } = vi.hoisted(() => ({
  stripeMock: {
    subscriptions: { list: vi.fn(), cancel: vi.fn() },
    customers: { retrieve: vi.fn() },
    invoices: { list: vi.fn(), retrieve: vi.fn() },
  },
  prismaMock: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../lib/stripe", () => ({ stripeClient: stripeMock }));
vi.mock("../../lib/prisma", () => ({ prisma: prismaMock }));

const premiumPrice = { id: "price_test_premium", product: "prod_note2tabs" };
const subscription = (created: number) => ({
  id: "sub_past_due",
  status: "past_due",
  customer: { id: "cus_123", email: "user@example.com" },
  latest_invoice: { id: "in_failed", created },
  items: { data: [{ price: premiumPrice }] },
});

describe("past-due reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_PRICE_PREMIUM_MONTHLY = premiumPrice.id;
    process.env.CRON_SECRET = "cron-test";
    stripeMock.subscriptions.cancel.mockResolvedValue({});
    stripeMock.invoices.list.mockImplementation(({ subscription: subscriptionId }) =>
      Promise.resolve({
        data: [{ id: "in_failed", subscription: subscriptionId, created: 0, attempt_count: 1 }],
      })
    );
    prismaMock.user.findUnique.mockResolvedValue({ id: "user_1", role: "PREMIUM" });
    prismaMock.user.update.mockResolvedValue({});
  });

  it("ends Premium after the 14-day recovery ceiling", async () => {
    const old = Math.floor((Date.now() - 15 * 86_400_000) / 1000);
    stripeMock.subscriptions.list
      .mockResolvedValueOnce({ data: [subscription(old)], has_more: false })
      .mockResolvedValueOnce({ data: [subscription(old)], has_more: false });
    stripeMock.invoices.list.mockResolvedValue({
      data: [{ id: "in_failed", created: old, attempt_count: 1 }],
    });
    const handler = (await import("../../pages/api/cron/reconcile-past-due")).default;
    const { req, res } = createMocks({
      method: "GET",
      headers: { authorization: "Bearer cron-test" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith("sub_past_due");
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { role: "FREE", tokensRemaining: 10 },
    });
  });

  it("keeps Premium while payment recovery is still underway", async () => {
    const recent = Math.floor((Date.now() - 2 * 86_400_000) / 1000);
    stripeMock.subscriptions.list.mockResolvedValue({ data: [subscription(recent)], has_more: false });
    stripeMock.invoices.list.mockResolvedValue({
      data: [{ id: "in_failed", created: recent, attempt_count: 1 }],
    });
    const handler = (await import("../../pages/api/cron/reconcile-past-due")).default;
    const { req, res } = createMocks({
      method: "GET",
      headers: { authorization: "Bearer cron-test" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
