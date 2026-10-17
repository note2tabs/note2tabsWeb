import { describe, it, expect, vi, afterEach } from "vitest";
import { buildContextualReminder } from "../../../lib/engagement/reminderCopy";
describe("contextual reminder copy", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("covers all ten locales, RTL, context types and signed opt-out", () => {
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "test-only-secret"); vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.note2tabs.com");
    for (const locale of ["en", "es", "pt-BR", "fr", "it", "pl", "ja", "ko", "zh-Hans", "ar"]) {
      for (const action of ["email_resume_practice", "email_resume_export_work", "email_resume_import", "email_try_another_transcription", "email_resume_editing"]) {
        const e = buildContextualReminder({ accountId: "test-user", locale, action, editorId: "p" });
        expect(e.subject.length).toBeGreaterThan(5); expect(e.html).toContain(`lang="${locale}"`);
        expect(e.text).toContain("/email/unsubscribe?token="); expect(e.text).toContain(action === "email_try_another_transcription" ? "/transcriber" : "/gte/p");
        if (locale === "ar") expect(e.html).toContain('dir="rtl"');
      }
    }
  });
  it("fails closed if an unsubscribe URL cannot be signed", () => {
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", ""); vi.stubEnv("CRON_SECRET", "");
    expect(() => buildContextualReminder({ accountId: "a", locale: "en", action: "email_resume_editing", editorId: "p" })).toThrow();
  });
});
