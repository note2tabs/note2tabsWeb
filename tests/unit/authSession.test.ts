import { describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { applyTokenToSession, applyUserStateToToken } from "../../lib/authSession";

describe("JWT-backed auth sessions", () => {
  it("persists the account fields needed for routine session restoration", () => {
    const token = applyUserStateToToken(
      { email: "player@example.com" } as JWT,
      {
        id: "user_1",
        role: "PREMIUM",
        subscriptionPlan: "PREMIUM",
        tokensRemaining: 42,
        emailVerifiedBool: true,
        unverifiedTranscriptionUsed: true,
        createdAt: new Date("2026-01-02T03:04:05.000Z"),
      }
    );

    expect(token).toMatchObject({
      id: "user_1",
      role: "PREMIUM",
      subscriptionPlan: "PREMIUM",
      tokensRemaining: 42,
      isEmailVerified: true,
      unverifiedTranscriptionUsed: true,
      createdAt: "2026-01-02T03:04:05.000Z",
    });
    expect(token.accountSyncedAt).toBeTypeOf("number");
  });

  it("restores a browser session entirely from the JWT payload", () => {
    const session = {
      user: { name: "Player", email: "player@example.com" },
      expires: "2026-08-24T00:00:00.000Z",
    } as Session;
    const token = {
      id: "user_1",
      role: "PREMIUM",
      subscriptionPlan: "PREMIUM",
      tokensRemaining: 42,
      isEmailVerified: true,
      unverifiedTranscriptionUsed: false,
      createdAt: "2026-01-02T03:04:05.000Z",
      accountSyncedAt: 1_750_000_000_000,
    } as JWT;

    expect(applyTokenToSession(session, token)).toEqual({
      user: {
        name: "Player",
        email: "player@example.com",
        id: "user_1",
        role: "PREMIUM",
        subscriptionPlan: "PREMIUM",
        tokensRemaining: 42,
        isEmailVerified: true,
        unverifiedTranscriptionUsed: false,
        createdAt: "2026-01-02T03:04:05.000Z",
        accountSyncedAt: 1_750_000_000_000,
      },
      expires: "2026-08-24T00:00:00.000Z",
    });
  });
});
