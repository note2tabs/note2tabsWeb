import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth/jwt", () => ({
  getToken: vi.fn(),
}));

import { getToken } from "next-auth/jwt";
import proxy from "../../proxy";

const mockedGetToken = vi.mocked(getToken);

describe("signed-in root redirect proxy", () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "test-secret";
    mockedGetToken.mockReset();
  });

  it("redirects an authenticated root request to product home", async () => {
    mockedGetToken.mockResolvedValue({ sub: "user-1" });

    const response = await proxy(new NextRequest("https://www.note2tabs.com/"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://www.note2tabs.com/home");
  });

  it("serves the public homepage when no session token exists", async () => {
    mockedGetToken.mockResolvedValue(null);

    const response = await proxy(new NextRequest("https://www.note2tabs.com/"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not interrupt pending transcription restoration", async () => {
    const response = await proxy(
      new NextRequest("https://www.note2tabs.com/?resumeTranscription=1")
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mockedGetToken).not.toHaveBeenCalled();
  });

  it("fails open when a session cookie cannot be decoded", async () => {
    mockedGetToken.mockRejectedValue(new Error("Invalid token"));

    const response = await proxy(new NextRequest("https://www.note2tabs.com/"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
