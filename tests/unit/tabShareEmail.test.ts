import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.fn();
vi.mock("../../lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn().mockResolvedValue(null) }, $queryRaw:vi.fn().mockResolvedValue([]) } }));

vi.mock("../../lib/email", () => ({
  sendTransactionalEmail: (...args: unknown[]) => sendEmail(...args),
}));

import { prisma } from "../../lib/prisma";
import { buildTabShareEmail, sendTabShareEmail } from "../../lib/tabShareEmail";

describe("tab sharing email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.note2tabs.com/");
    sendEmail.mockResolvedValue(true);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
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
      "https://www.note2tabs.com/shared?source=tab_share_email&utm_source=note2tabs&utm_medium=email&utm_campaign=tab_sharing&editor=editor%2F1"
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

  it("uses the recipient account preference instead of the sender's locale", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({id:"recipient"} as any);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{locale:"pl"}]);
    await sendTabShareEmail({to:"player@example.com",locale:"ja",inviterName:"Noel",editorId:"editor",role:"viewer",recipientHasAccount:true});
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({html:expect.stringContaining('lang="pl"')}));
  });

  it("does not assume an unknown recipient speaks the sender's language", async () => {
    await sendTabShareEmail({to:"new@example.com",locale:"ja",editorId:"editor",role:"viewer",recipientHasAccount:false});
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({html:expect.stringContaining('lang="en"')}));
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
    expect(email.signupUrl).toContain("utm_campaign=tab_sharing");
    expect(email.html).toContain("Create account and open tab");
    expect(email.html).toContain("Note2Tabs is an online guitar-tab editor");
    expect(email.html).toContain("view the tablature, hear it played back, and follow along");
    expect(email.text).toContain("The account makes sure the invitation is connected to the right person");
    expect(email.html).toContain("You have not been added to a marketing list");
    expect(email.html).toContain("Block future sharing emails");
    expect(email.html).not.toMatch(/premium|discount|upgrade/i);
  });
});
