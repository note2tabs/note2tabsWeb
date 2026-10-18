import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCreditResetEmail } from "../../lib/creditResetEmail";
import { creditResetCopy } from "../../lib/i18n/creditResetCopy";
import { emailLanguageProblems } from "../../lib/emailLanguage";
import type { AppLocale } from "../../lib/i18n/locale";
afterEach(() => vi.unstubAllEnvs());
describe("credit reset localization", () => {
  it.each(Object.keys(creditResetCopy) as AppLocale[])(
    "validates body/action/unsubscribe in %s",
    (locale) => {
      vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "test-only");
      vi.stubEnv("NEXTAUTH_URL", "https://www.note2tabs.com");
      const email = buildCreditResetEmail("user", locale);
      expect(
        emailLanguageProblems(
          email,
          { kind: "customer", template: "credit_reset", locale },
          locale,
        ),
      ).toEqual([]);
      expect(email.text).toContain("source=credit_reset_email");
      expect(email.html).toContain("/email/unsubscribe?token=");
      expect(
        emailLanguageProblems(
          email,
          { kind: "customer", template: "credit_reset", locale },
          locale === "en" ? "es" : "en",
        ),
      ).toContain("account_preference_mismatch");
    },
  );
  it("blocks creation without an unsubscribe signer", () => {
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "");
    vi.stubEnv("CRON_SECRET", "");
    expect(() => buildCreditResetEmail("user", "es")).toThrow("Unsubscribe");
  });
});
