import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/email", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue(true) }));
import { emailLanguageProblems, type CustomerEmailTemplate } from "../../lib/emailLanguage";
import { sendTransactionalEmail } from "../../lib/email";
import { sendVerificationEmail } from "../../lib/emailVerification";
import { sendPasswordResetEmail } from "../../lib/passwordReset";
import { buildTranscriptionCompleteEmail } from "../../lib/transcriptionCompleteEmail";
import { buildInactiveSignupReminderEmail } from "../../lib/inactiveSignupReminder";
import { buildTabReturnReminderEmail } from "../../lib/tabReturnReminder";
import { buildPremiumTrialStartedEmail, buildPremiumTrialReminderEmail } from "../../lib/premiumTrialReminder";
import { buildProStartedEmail } from "../../lib/proSubscriptionEmail";
import { buildPaymentFailedEmail } from "../../lib/paymentRecovery";
import { buildTabShareEmail } from "../../lib/tabShareEmail";
import { ALL_LOCALES, localeHref } from "../../lib/i18n/locale";
import { serviceEmails } from "../../lib/i18n/serviceEmails";
import { stripeEmailLocales } from "../../lib/i18n/stripeEmailLanguage";

describe("all customer email languages", () => {
 afterEach(() => {vi.unstubAllEnvs();vi.clearAllMocks();});
 it.each(ALL_LOCALES)("renders every email path in %s with escaped content and working links", async locale => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL","https://www.note2tabs.com");
  vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET","test-only-secret");
  const name = "<script>unsafe</script>";
  const common = {locale,name,userId:"account",editorId:"editor/1",editorName:name};
  const trial = {locale,name,trialEndsAt:new Date("2026-11-01T12:00:00Z"),trialStartsAt:new Date("2026-10-25T12:00:00Z")};
  await sendVerificationEmail("person@example.com","token",{locale,name});
  await sendPasswordResetEmail("person@example.com","reset","123456",{locale,name});
  const auth = vi.mocked(sendTransactionalEmail).mock.calls.map(c=>c[0]);
  const completion = buildTranscriptionCompleteEmail({locale,name,jobId:"job/1",sourceLabel:name});
  const signup = buildInactiveSignupReminderEmail(common);
  const saved = buildTabReturnReminderEmail(common);
  const started = buildPremiumTrialStartedEmail(trial), ending = buildPremiumTrialReminderEmail(trial);
  const emails = [...auth,completion,signup,saved,started,ending,buildProStartedEmail(name,locale),buildPaymentFailedEmail({locale,name}),
   ...[true,false].map(recipientHasAccount=>buildTabShareEmail({locale,to:"person@example.com",inviterName:name,tabName:name,editorId:"editor/1",role:"editor",recipientHasAccount}))];
  expect(auth[0].text).toContain(localeHref("/auth/verify-email",locale));
  expect(auth[1].text).toContain(localeHref("/reset-password/reset",locale));
  expect(auth[1].text).toContain("123456");
  expect(signup.transcriberUrl).toContain(localeHref("/transcribe",locale));
  expect(saved.editorUrl).toContain("/gte/editor%2F1");
  expect(signup.text).toContain("/email/unsubscribe?token=");
  expect(saved.text).toContain("/email/unsubscribe?token=");
  expect(completion.text).not.toMatch(/El editor está en inglés|O editor está em inglês/);
  const templates:CustomerEmailTemplate[]=["verification","password_reset","transcription_complete","inactive_signup","tab_return","trial_started","trial_ending","pro_started","payment_failed","tab_share","tab_share"];
  for (const [index,email] of emails.entries()) {
   expect(emailLanguageProblems(email,{kind:"customer",locale,template:templates[index]}),`${locale}:${templates[index]}`).toEqual([]);
   expect(email.html).toContain(`lang="${locale}"`);
   expect(email.html).toContain(`dir="${locale === "ar" ? "rtl" : "ltr"}"`);
   expect(email.html).not.toContain(name);
   expect(email.html).not.toMatch(/\{(?:label|inviter|permission|end|start|plan)\}/);
   expect(email.text).not.toMatch(/\{(?:label|inviter|permission|end|start|plan)\}/);
   expect(email.subject.length).toBeGreaterThan(5);
  }
  if (locale !== "en") {
   expect(started.text).toContain(serviceEmails[locale].features);
   expect(ending.text).toContain(new Intl.DateTimeFormat(locale,{month:"long",day:"numeric",year:"numeric",timeZone:"UTC"}).format(trial.trialEndsAt));
   for (const email of emails) expect(email.subject).not.toMatch(/Your Note2Tabs|Still interested|shared a Note2Tabs|Please update/);
  }
 });
 it("maps provider language codes without requesting unsupported Arabic Stripe invoices",()=>{
  expect(stripeEmailLocales("zh-Hans")).toEqual(["zh-CN"]);
  expect(stripeEmailLocales("pt-BR")).toEqual(["pt-BR"]);
  expect(stripeEmailLocales("ar")).toEqual(["en"]);
 });
});
