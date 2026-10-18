import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  enabled: vi.fn(),
  collect: vi.fn(),
  candidates: vi.fn(),
  claim: vi.fn(),
  finish: vi.fn(),
  send: vi.fn(),
  configured: vi.fn(),
  ph: { capture: vi.fn(), flush: vi.fn() },
}));
vi.mock("../../lib/cloudSchedulerAuth", () => ({
  isAuthorizedSchedulerRequest: m.auth,
}));
vi.mock("../../lib/creditResetNotices", () => ({
  creditResetEmailsEnabled: m.enabled,
  collectFreeCreditResets: m.collect,
  creditResetCandidates: m.candidates,
  claimCreditReset: m.claim,
  finishCreditReset: m.finish,
}));
vi.mock("../../lib/email", () => ({
  isEmailDeliveryConfigured: m.configured,
  sendTransactionalEmail: m.send,
}));
vi.mock("../../lib/i18n/accountLanguage", () => ({
  accountEmailLocale: async () => "es",
}));
vi.mock("../../lib/posthogServer", () => ({
  createPostHogServerClient: () => m.ph,
}));
import handler from "../../pages/api/cron/credit-reset-reminder";
const candidate = {
  id: "reset",
  accountId: "user",
  email: "synthetic@example.test",
  source: "free",
};
beforeEach(() => {
  vi.resetAllMocks();
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test";
  m.auth.mockResolvedValue(true);
  m.enabled.mockReturnValue(true);
  m.configured.mockReturnValue(true);
  m.candidates.mockResolvedValue([candidate]);
  m.claim.mockResolvedValue(true);
  m.send.mockResolvedValue(true);
  m.ph.flush.mockResolvedValue(undefined);
});
async function run(query = {}) {
  const { req, res } = createMocks({ method: "POST", query });
  await handler(req, res);
  return res;
}
describe("credit reset dispatch", () => {
  it("rejects unauthenticated callers without reading candidates", async () => {
    m.auth.mockResolvedValue(false);
    expect((await run())._getStatusCode()).toBe(401);
    expect(m.candidates).not.toHaveBeenCalled();
  });
  it("disabled and dry-run modes never send", async () => {
    m.enabled.mockReturnValue(false);
    await run();
    expect(m.collect).not.toHaveBeenCalled();
    m.enabled.mockReturnValue(true);
    await run({ dryRun: "1" });
    expect(m.send).not.toHaveBeenCalled();
    expect(m.claim).not.toHaveBeenCalled();
  });
  it("sends in account language and records an accepted outcome", async () => {
    await run();
    expect(m.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Tus créditos de Note2Tabs se han renovado",
        language: {
          kind: "customer",
          template: "credit_reset",
          locale: "es",
          accountId: "user",
        },
      }),
    );
    expect(m.finish).toHaveBeenCalledWith(
      "reset",
      "accepted",
      expect.any(Date),
    );
  });
  it("does not send when another scheduler owns the claim", async () => {
    m.claim.mockResolvedValue(false);
    await run();
    expect(m.send).not.toHaveBeenCalled();
  });
  it("cancels when permission is revoked after claiming", async () => {
    m.candidates
      .mockResolvedValueOnce([candidate])
      .mockResolvedValueOnce([candidate])
      .mockResolvedValueOnce([]);
    await run();
    expect(m.send).not.toHaveBeenCalled();
    expect(m.finish).toHaveBeenCalledWith(
      "reset",
      "cancelled",
      expect.any(Date),
    );
  });
  it("holds ambiguous provider failures for review instead of replaying automatically", async () => {
    m.send.mockRejectedValue(new Error("connection lost after DATA"));
    await run();
    expect(m.finish).toHaveBeenCalledWith(
      "reset",
      "ambiguous",
      expect.any(Date),
    );
    expect(m.ph.capture).toHaveBeenCalledWith(
      expect.objectContaining({ event: "reminder_email_delivery_failed" }),
    );
  });
});
