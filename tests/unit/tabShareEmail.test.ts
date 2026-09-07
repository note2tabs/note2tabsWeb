import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.fn();

vi.mock("../../lib/email", () => ({
  sendTransactionalEmail: (...args: unknown[]) => sendEmail(...args),
}));

import { buildTabShareEmail, sendTabShareEmail } from "../../lib/tabShareEmail";

describe("tab sharing email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.note2tabs.com/");
    sendEmail.mockResolvedValue(true);
  });

  it("links recipients to the shared-tab acceptance page", () => {
    const email = buildTabShareEmail({
      to: "player@example.com",
      inviterName: "Noel",
      tabName: "Autumn fall",
      editorId: "editor/1",
      role: "editor",
      recipientHasAccount: true,
    });

    expect(email.subject).toBe("Noel shared a Note2Tabs tab with you");
    expect(email.sharedUrl).toBe(
      "https://www.note2tabs.com/shared?source=tab_share_email&editor=editor%2F1"
    );
    expect(email.text).toContain("view and edit “Autumn fall”");
  });

  it("escapes user-controlled labels in HTML", () => {
    const email = buildTabShareEmail({
      to: "player@example.com",
      inviterName: "<Noel>",
      tabName: "<script>alert(1)</script>",
      editorId: "editor-1",
      role: "viewer",
      recipientHasAccount: true,
    });

    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).toContain("&lt;Noel&gt;");
  });

  it("sends through the configured transactional provider with an SES category", async () => {
    await expect(
      sendTabShareEmail({
        to: "player@example.com",
        inviterName: "Noel",
        tabName: "Autumn fall",
        editorId: "editor-1",
        role: "viewer",
        recipientHasAccount: true,
      })
    ).resolves.toBe(true);

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "player@example.com",
        analyticsCategory: "tab_share",
      })
    );
  });

  it("uses a separate, non-promotional invitation for recipients without accounts", () => {
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "test-secret");
    const email = buildTabShareEmail({
      to: "new-player@example.com",
      inviterName: "Noel",
      tabName: "Autumn fall",
      editorId: "editor-1",
      role: "viewer",
      recipientHasAccount: false,
    });

    expect(email.signupUrl).toContain("/auth/signup?next=");
    expect(email.html).toContain("Create account to open tab");
    expect(email.html).toContain("You have not been added to a marketing list");
    expect(email.html).toContain("Block future sharing emails");
    expect(email.html).not.toMatch(/premium|discount|upgrade/i);
  });
});
