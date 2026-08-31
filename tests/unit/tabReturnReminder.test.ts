import { afterEach, describe, expect, it } from "vitest";
import {
  buildTabReturnCooldownIdentifier,
  buildTabReturnMarkerToken,
  buildTabReturnReminderEmail,
  buildTabReturnReminderIdentifier,
  isInTabReturnReminderRollout,
} from "../../lib/tabReturnReminder";

describe("tab return reminder", () => {
  afterEach(() => delete process.env.NEXT_PUBLIC_APP_URL);

  it("deep-links to the saved editor and escapes user-controlled text", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.note2tabs.com/";
    const email = buildTabReturnReminderEmail({
      name: "Noel Example",
      editorId: "editor 123",
      editorName: "Song <demo>",
    });

    expect(email.editorUrl).toBe("https://www.note2tabs.com/gte/editor%20123?source=tab_return_email");
    expect(email.subject).toBe("Continue working on Song <demo>");
    expect(email.html).toContain("Song &lt;demo&gt;");
    expect(email.html).not.toContain("<strong>Song <demo></strong>");
    expect(email.text).toContain("play it, make adjustments, or continue practicing");
  });

  it("creates stable, scoped idempotency identifiers", () => {
    expect(buildTabReturnReminderIdentifier("user-1", "tab-1")).toBe("reminder:return-to-tab:user-1:tab-1");
    expect(buildTabReturnCooldownIdentifier("user-1")).toBe("reminder:return-to-tab-cooldown:user-1");
    expect(buildTabReturnMarkerToken("user-1", "tab-1")).toBe(buildTabReturnMarkerToken("user-1", "tab-1"));
    expect(buildTabReturnMarkerToken("user-1", "tab-1")).not.toBe(buildTabReturnMarkerToken("user-1", "tab-2"));
  });

  it("uses a deterministic rollout and safe boundaries", () => {
    expect(isInTabReturnReminderRollout("user-1", "tab-1", 0)).toBe(false);
    expect(isInTabReturnReminderRollout("user-1", "tab-1", 100)).toBe(true);
    expect(isInTabReturnReminderRollout("user-1", "tab-1", 20)).toBe(
      isInTabReturnReminderRollout("user-1", "tab-1", 20)
    );
  });
});
