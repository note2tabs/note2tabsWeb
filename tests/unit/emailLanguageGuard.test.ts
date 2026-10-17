import {beforeEach,describe,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({send:vi.fn(),create:vi.fn(),language:vi.fn(),capture:vi.fn()}));
vi.mock("nodemailer9",()=>({default:{createTransport:m.create}}));
vi.mock("../../lib/i18n/accountLanguage",()=>({accountEmailLocale:m.language}));
vi.mock("../../lib/posthogServer",()=>({createPostHogServerClient:()=>({captureExceptionImmediate:m.capture})}));
import {sendTransactionalEmail} from "../../lib/email";
import {buildTranscriptionCompleteEmail} from "../../lib/transcriptionCompleteEmail";
import {EmailLanguageMismatchError} from "../../lib/emailLanguage";
describe("email language delivery guard",()=>{
 beforeEach(()=>{
  vi.clearAllMocks();vi.stubEnv("SES_SMTP_HOST","smtp.example.com");vi.stubEnv("SES_SMTP_PORT","587");vi.stubEnv("SES_SMTP_USERNAME","user");vi.stubEnv("SES_SMTP_PASSWORD","secret");
  m.create.mockReturnValue({sendMail:m.send});m.send.mockResolvedValue({messageId:"accepted"});m.language.mockResolvedValue("fr");m.capture.mockResolvedValue(undefined);
 });
 const message=(locale:"en"|"fr")=>buildTranscriptionCompleteEmail({locale,jobId:"job",sourceLabel:"Private song"});
 it("sends the validated French content and language header through SMTP",async()=>{
  await expect(sendTransactionalEmail({to:"owner@example.com",...message("fr"),language:{kind:"customer",template:"transcription_complete",locale:"fr",accountId:"owner"}})).resolves.toBe(true);
  expect(m.send).toHaveBeenCalledWith(expect.objectContaining({subject:"Votre transcription Note2Tabs est prête",headers:expect.objectContaining({"Content-Language":"fr"})}));expect(m.capture).not.toHaveBeenCalled();
 });
 it("blocks a forgotten locale against the independently read account preference and captures an actionable error",async()=>{
  await expect(sendTransactionalEmail({to:"owner@example.com",...message("en"),language:{kind:"customer",template:"transcription_complete",locale:"en",accountId:"owner"}})).rejects.toBeInstanceOf(EmailLanguageMismatchError);
  expect(m.send).not.toHaveBeenCalled();expect(m.language).toHaveBeenCalledWith("owner","en");
  expect(m.capture).toHaveBeenCalledWith(expect.any(EmailLanguageMismatchError),"owner",expect.objectContaining({alert_eligible:true,expected_locale:"fr",rendered_locale:"en",delivery_stage:"blocked_before_send",validation_reasons:expect.arrayContaining(["account_preference_mismatch","subject_copy_mismatch","html_copy_mismatch","text_copy_mismatch"])}));
  expect(JSON.stringify(m.capture.mock.calls)).not.toMatch(/owner@example|Private song|language-delivery-test|\/job\//);
 });
 it("rejects English content even when HTML and metadata claim French",async()=>{
  const email=message("en");email.html=email.html.replace('lang="en"','lang="fr"');
  await expect(sendTransactionalEmail({to:"owner@example.com",...email,language:{kind:"customer",template:"transcription_complete",locale:"fr"}})).rejects.toBeInstanceOf(EmailLanguageMismatchError);
  expect(m.send).not.toHaveBeenCalled();expect(m.capture.mock.calls[0][2].validation_reasons).toEqual(expect.arrayContaining(["subject_copy_mismatch","html_copy_mismatch","text_copy_mismatch"]));
 });
 it("checks plain text separately and still blocks if analytics is unavailable",async()=>{
  const email={...message("fr"),text:message("en").text};m.capture.mockRejectedValue(new Error("analytics offline"));
  await expect(sendTransactionalEmail({to:"owner@example.com",...email,language:{kind:"customer",template:"transcription_complete",locale:"fr"}})).rejects.toBeInstanceOf(EmailLanguageMismatchError);
  expect(m.send).not.toHaveBeenCalled();expect(m.capture.mock.calls[0][2].validation_reasons).toEqual(["text_copy_mismatch"]);
 });
 it("blocks and alerts when account preference cannot be resolved",async()=>{
  m.language.mockRejectedValue(new Error("database unavailable"));
  await expect(sendTransactionalEmail({to:"owner@example.com",...message("fr"),language:{kind:"customer",template:"transcription_complete",locale:"fr",accountId:"owner"}})).rejects.toBeInstanceOf(EmailLanguageMismatchError);
  expect(m.send).not.toHaveBeenCalled();expect(m.capture.mock.calls[0][2].validation_reasons).toEqual(["preference_lookup_failed"]);
 });
 it("catches an English action inside an otherwise French message",async()=>{
  const email=message("fr");email.html=email.html.replace("Ouvrir dans l’éditeur","Open in editor");
  await expect(sendTransactionalEmail({to:"owner@example.com",...email,language:{kind:"customer",template:"transcription_complete",locale:"fr"}})).rejects.toBeInstanceOf(EmailLanguageMismatchError);
  expect(m.send).not.toHaveBeenCalled();
 });
 it("does not allow a future sender to omit the language context",async()=>{
  await expect(sendTransactionalEmail({to:"owner@example.com",...message("en")} as any)).rejects.toBeInstanceOf(EmailLanguageMismatchError);
  expect(m.send).not.toHaveBeenCalled();expect(m.capture.mock.calls[0][2].validation_reasons).toEqual(["language_context_missing"]);
 });
});
