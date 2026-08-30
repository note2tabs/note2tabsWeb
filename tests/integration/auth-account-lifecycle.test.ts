import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMocks } from "node-mocks-http";

const mocks = vi.hoisted(() => ({
  hash: vi.fn(),
  issueVerification: vi.fn(),
  issueReset: vi.fn(),
  linkIdentity: vi.fn(),
  trackAffiliate: vi.fn(),
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    affiliate: { findFirst: vi.fn() },
    affiliateAttribution: { upsert: vi.fn() },
    verificationToken: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("bcryptjs", () => ({ hash: (...args: unknown[]) => mocks.hash(...args) }));
vi.mock("../../lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("../../lib/emailVerification", async () => {
  const actual = await vi.importActual<typeof import("../../lib/emailVerification")>(
    "../../lib/emailVerification"
  );
  return {
    ...actual,
    issueAndSendVerificationEmail: (...args: unknown[]) => mocks.issueVerification(...args),
  };
});
vi.mock("../../lib/passwordReset", async () => {
  const actual = await vi.importActual<typeof import("../../lib/passwordReset")>(
    "../../lib/passwordReset"
  );
  return {
    ...actual,
    issueAndSendPasswordResetEmail: (...args: unknown[]) => mocks.issueReset(...args),
  };
});
vi.mock("../../lib/analyticsV2/identity", () => ({
  linkIdentityToUser: (...args: unknown[]) => mocks.linkIdentity(...args),
}));
vi.mock("../../lib/affiliateTracking", () => ({
  trackAffiliateEvent: (...args: unknown[]) => mocks.trackAffiliate(...args),
}));

describe("account signup, verification, and password-reset lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hash.mockResolvedValue("hashed-password");
    mocks.issueVerification.mockResolvedValue({ sent: true, token: "verify-token" });
    mocks.issueReset.mockResolvedValue({ sent: true, token: "reset-token", code: "123456" });
    mocks.linkIdentity.mockResolvedValue(undefined);
    mocks.trackAffiliate.mockResolvedValue(undefined);
    mocks.prisma.affiliate.findFirst.mockResolvedValue(null);
    mocks.prisma.user.create.mockResolvedValue({
      id: "user_1",
      email: "player@example.com",
      name: "Player",
    });
    mocks.prisma.user.update.mockResolvedValue({});
    mocks.prisma.verificationToken.delete.mockResolvedValue({});
  });

  it("durably attributes a signup from an affiliate click and mirrors it to PostHog", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.affiliate.findFirst.mockResolvedValue({ id: "affiliate_1", code: "PLAYER10" });
    const handler = (await import("../../pages/api/auth/signup")).default;
    const { req, res } = createMocks({
      method: "POST",
      cookies: {
        n2t_ref: "PLAYER10",
        n2t_ref_click: "123e4567-e89b-12d3-a456-426614174000",
      },
      body: { email: "player@example.com", password: "a-secure-password", name: "Player" },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mocks.prisma.affiliateAttribution.upsert).toHaveBeenCalledWith({
      where: { referredUserId: "user_1" },
      create: {
        affiliateId: "affiliate_1",
        referredUserId: "user_1",
        source: "signup",
      },
      update: {},
    });
    expect(mocks.trackAffiliate).toHaveBeenCalledWith(expect.objectContaining({
      distinctId: "user_1",
      event: "affiliate_signup_completed",
      properties: expect.objectContaining({ affiliate_click_id: "123e4567-e89b-12d3-a456-426614174000" }),
    }));
  });

  it("creates an account, normalizes its email, and sends verification", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    const handler = (await import("../../pages/api/auth/signup")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: {
        email: "PLAYER@EXAMPLE.COM",
        password: "a-secure-password",
        name: "Player",
        fingerprintId: "browser_1",
        returnTo: "/transcribe?resumeTranscription=1",
      },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      ok: true,
      requiresVerification: true,
      emailSent: true,
      email: "player@example.com",
    });
    expect(mocks.prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "player@example.com",
        passwordHash: "hashed-password",
        role: "FREE",
        emailVerifiedBool: false,
      }),
    });
    expect(mocks.issueVerification).toHaveBeenCalledWith(
      {
        id: "user_1",
        email: "player@example.com",
        name: "Player",
      },
      { returnTo: "/transcribe?resumeTranscription=1" }
    );
  });

  it("verifies the account and consumes the one-time token", async () => {
    mocks.prisma.verificationToken.findUnique.mockResolvedValue({
      token: "verify-token",
      identifier: "verify:user_1",
      expires: new Date(Date.now() + 60_000),
    });
    const handler = (await import("../../pages/api/auth/verify-email")).default;
    const { req, res } = createMocks({ method: "POST", body: { token: "verify-token" } });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: expect.objectContaining({ emailVerifiedBool: true, emailVerified: expect.any(Date) }),
    });
    expect(mocks.prisma.verificationToken.delete).toHaveBeenCalledWith({
      where: { token: "verify-token" },
    });
  });

  it("requests, validates, and completes a password reset", async () => {
    mocks.prisma.user.findUnique
      .mockResolvedValueOnce({ id: "user_1", email: "player@example.com", name: "Player" })
      .mockResolvedValueOnce({ id: "user_1" });

    const requestHandler = (await import("../../pages/api/auth/request-reset")).default;
    const requested = createMocks({
      method: "POST",
      body: { email: "PLAYER@EXAMPLE.COM" },
    });
    await requestHandler(requested.req as any, requested.res as any);
    expect(requested.res._getStatusCode()).toBe(200);
    expect(mocks.issueReset).toHaveBeenCalledWith({
      id: "user_1",
      email: "player@example.com",
      name: "Player",
    });

    mocks.prisma.verificationToken.findUnique.mockResolvedValue({
      token: "reset-token",
      identifier: "reset:user_1:123456",
      expires: new Date(Date.now() + 60_000),
    });
    const resetHandler = (await import("../../pages/api/auth/reset-password")).default;
    const validation = createMocks({ method: "GET", query: { token: "reset-token" } });
    await resetHandler(validation.req as any, validation.res as any);
    expect(validation.res._getStatusCode()).toBe(200);

    const completion = createMocks({
      method: "POST",
      body: { token: "reset-token", code: "123 456", password: "new-secure-password" },
    });
    await resetHandler(completion.req as any, completion.res as any);

    expect(completion.res._getStatusCode()).toBe(200);
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { passwordHash: "hashed-password" },
    });
    expect(mocks.prisma.verificationToken.delete).toHaveBeenCalledWith({
      where: { token: "reset-token" },
    });
  });

  it("does not disclose whether an email has an account", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    const handler = (await import("../../pages/api/auth/request-reset")).default;
    const { req, res } = createMocks({
      method: "POST",
      body: { email: "unknown@example.com" },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ ok: true });
    expect(mocks.issueReset).not.toHaveBeenCalled();
  });
});
