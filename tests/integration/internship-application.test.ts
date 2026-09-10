import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const mocks = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("../../lib/email", () => ({ sendTransactionalEmail: (...args: unknown[]) => mocks.sendEmail(...args) }));

const validBody = () => ({
  email: "student@example.com",
  program: "Computer Science",
  studyYear: "Third year",
  presentation: "I would like to build accessible music tools.",
  portfolio: "https://example.com",
  linkedIn: "https://linkedin.com/in/student",
  company: "",
  startedAt: Date.now() - 5000,
});

async function request(options: { method?: string; body?: Record<string, unknown>; origin?: string; ip?: string } = {}) {
  const handler = (await import("../../pages/api/internship-application")).default;
  const { req, res } = createMocks({
    method: options.method || "POST",
    headers: {
      host: "www.note2tabs.com",
      origin: options.origin === undefined ? "https://www.note2tabs.com" : options.origin,
      "x-forwarded-for": options.ip || `192.0.2.${Math.floor(Math.random() * 200) + 1}`,
      "content-length": "500",
    },
    body: options.body || validBody(),
  });
  await handler(req as any, res as any);
  return res;
}

describe("internship application endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendEmail.mockResolvedValue(true);
  });

  it("emails a valid application to the administrative address", async () => {
    const res = await request();
    expect(res._getStatusCode()).toBe(200);
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "admin@note2tabs.com",
      subject: expect.stringContaining("Computer Science"),
      html: expect.stringContaining("student@example.com"),
      text: expect.stringContaining("accessible music tools"),
    }));
  });

  it("rejects wrong methods and cross-origin submissions", async () => {
    expect((await request({ method: "GET" }))._getStatusCode()).toBe(405);
    expect((await request({ origin: "https://attacker.example" }))._getStatusCode()).toBe(400);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("rejects invalid and honeypot submissions", async () => {
    expect((await request({ body: { ...validBody(), email: "invalid" } }))._getStatusCode()).toBe(422);
    expect((await request({ body: { ...validBody(), company: "Spam" } }))._getStatusCode()).toBe(400);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("returns a retryable response when SES fails", async () => {
    mocks.sendEmail.mockRejectedValueOnce(new Error("SES unavailable"));
    const res = await request();
    expect(res._getStatusCode()).toBe(503);
    expect(res._getJSONData()).toEqual({ error: "We could not send your application. Please try again." });
  });
});
