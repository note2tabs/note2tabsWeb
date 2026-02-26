import { describe, expect, it, vi } from "vitest";
import { linkIdentityToUser } from "../../lib/analyticsV2/identity";
import { hashFingerprint } from "../../lib/analyticsV2/fingerprintHash";

describe("linkIdentityToUser", () => {
  it("upserts identity links and retro-attributes last 30 days", async () => {
    const prismaMock = {
      analyticsConsentSubject: {
        findUnique: vi.fn(async () => null),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      analyticsEventV2: {
        findFirst: vi.fn(async () => null),
        updateMany: vi.fn(async () => ({ count: 3 })),
      },
      analyticsEvent: {
        updateMany: vi.fn(async () => ({ count: 2 })),
      },
      analyticsIdentityLink: {
        upsert: vi.fn(async () => ({})),
      },
    } as any;

    const linked = await linkIdentityToUser({
      prismaClient: prismaMock,
      userId: "user_123",
      source: "login",
      anonId: "anon_123",
      sessionId: "sess_123",
      rawFingerprint: "raw-fingerprint",
    });

    const expectedHash = hashFingerprint("raw-fingerprint");
    expect(linked.ok).toBe(true);
    expect(linked.userId).toBe("user_123");
    expect(linked.fingerprintHash).toBe(expectedHash);
    expect(prismaMock.analyticsIdentityLink.upsert).toHaveBeenCalledTimes(2);

    const v2UpdateArgs = prismaMock.analyticsEventV2.updateMany.mock.calls[0][0];
    expect(v2UpdateArgs.where.accountId).toBeNull();
    expect(v2UpdateArgs.where.fingerprintHash).toBe(expectedHash);
    expect(v2UpdateArgs.data.accountId).toBe("user_123");
  });
});
