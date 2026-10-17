import { localizedEmailCopy } from "./i18n/emails";
import { serviceEmails } from "./i18n/serviceEmails";
import { contextualReminderCopy } from "./i18n/contextualReminderCopy";
import { validLocale } from "./i18n/preference";
import type { AppLocale } from "./i18n/locale";

export type CustomerEmailTemplate = "verification" | "password_reset" | "transcription_complete" | "inactive_signup" | "tab_return" | "trial_started" | "trial_ending" | "pro_started" | "payment_failed" | "tab_share" | "contextual_reminder";
export type EmailLanguage = {kind:"internal"} | {kind:"customer";locale:AppLocale;template:CustomerEmailTemplate;accountId?:string;test?:boolean};
type Content = {subject:string;html:string;text?:string};
export class EmailLanguageMismatchError extends Error {
 constructor(public readonly reasons:string[]) { super("Customer email language validation failed");this.name="EmailLanguageMismatchError"; }
}
function readable(html:string) {
 return html.replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim();
}
const normalized = (text:string) => text.replace(/\s+/g," ").trim();
function subjectMatches(content:string, template:string) {
 const pattern = template.split(/\{\w+\}/).map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join(".*");
 return new RegExp(`^${pattern}$`,"u").test(content);
}
function containsPhrase(content:string, phrase:string) {
 // Check all fixed parts independently of dynamic names, labels and dates.
 return phrase.split(/\{\w+\}/).filter(part=>part.trim().length>=4).every(part=>normalized(content).includes(normalized(part)));
}
export function emailLanguageProblems(content:Content, language:Exclude<EmailLanguage,{kind:"internal"}>, expected:AppLocale = language.locale) {
 if (!validLocale(expected)) return ["invalid_expected_locale"];
 const reasons:string[]=[];
 if (!validLocale(language.locale) || language.locale !== expected) reasons.push("account_preference_mismatch");
 const rootLocale=validLocale(content.html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1]);
 if (rootLocale !== expected) reasons.push("html_locale_mismatch");
 if (expected === "ar" && !/<html\b[^>]*\bdir=["']rtl["']/i.test(content.html)) reasons.push("rtl_missing");
 const subject=language.test ? content.subject.replace(/^\[TEST\] /,"") : content.subject;
 const html=readable(content.html), text=normalized(content.text || "");
 const c=serviceEmails[expected], auth=localizedEmailCopy(expected);
 let subjects:string[]=[], htmlPhrases:string[]=[], textPhrases:string[]=[];
 switch(language.template) {
  case "verification": subjects=[auth?.verification.subject || "Verify your Note2Tabs account"];htmlPhrases=[auth?.verification.body || "Verify your email address to finish setting up your account and use the transcriber."];textPhrases=[auth?.verification.body || "Please verify your email to use the transcriber:"];break;
  case "password_reset":subjects=[auth?.reset.subject || "Reset your Note2Tabs password"];htmlPhrases=[auth?.reset.body || "We received a request to reset your password."];textPhrases=[auth?.reset.body || "We received a request to reset your Note2Tabs password."];break;
  case "transcription_complete":subjects=[auth?.completion.subject || "Your Note2Tabs transcription is ready"];htmlPhrases=[auth?.completion.body || "is ready. Open it to play, edit, practice, or export your tab."];textPhrases=[auth?.completion.body || "is ready. Open it in the Note2Tabs editor to play, edit, practice, and export your tabs."];break;
  case "inactive_signup":subjects=[c.signup[0]];htmlPhrases=[expected==="en" ? "You created a Note2Tabs account but have not tried a transcription yet." : c.signup[1]];textPhrases=[expected==="en" ? "You created a Note2Tabs account a little while ago" : c.signup[1]];break;
  case "tab_return":subjects=[c.saved[0]];htmlPhrases=[expected==="en" ? "Return whenever you want to play it, make changes, or keep practicing." : c.saved[1]];textPhrases=[expected==="en" ? "When you are ready, you can return to play it, make adjustments, or continue practicing." : c.saved[1]];break;
  case "trial_started":subjects=[c.trialStarted[0]];htmlPhrases=[c.trialStarted[1]];textPhrases=htmlPhrases;break;
  case "trial_ending":subjects=[c.trialEnding[0]];htmlPhrases=[expected==="en" ? "After the trial, Premium renews at the price and billing interval confirmed at checkout unless you cancel before then." : c.trialEnding[1]];textPhrases=[expected==="en" ? "After the trial, Premium renews at the price and billing interval confirmed at checkout unless you cancel before then." : c.trialEnding[1]];break;
  case "pro_started":subjects=[c.pro[0]];htmlPhrases=[c.pro[1]];textPhrases=[expected==="en" ? "You now have 250 monthly credits, rollover up to 500, uploads up to 500 MB, and priority email support." : c.pro[1]];break;
  case "payment_failed":subjects=[c.payment[0]];htmlPhrases=[expected==="en" ? "We could not process your latest payment." : c.payment[1]];textPhrases=[expected==="en" ? "We couldn't process your latest Note2Tabs" : c.payment[1]];break;
  case "tab_share":subjects=[c.share[0]];
   if(expected==="en") {
    const phrases=["on Note2Tabs.","Note2Tabs is an online guitar-tab editor."];
    if(!phrases.some(p=>html.includes(p)))reasons.push("html_copy_mismatch");
    if(!phrases.some(p=>text.includes(p)))reasons.push("text_copy_mismatch");
   } else {htmlPhrases=[c.share[1]];textPhrases=htmlPhrases;}
   break;
  case "contextual_reminder": {
   const reminder=contextualReminderCopy[expected];subjects=[reminder[0]];
   const options=reminder.slice(1,6);
   if (!options.some(p=>html.includes(normalized(p)))) reasons.push("html_copy_mismatch");
   if (!options.some(p=>text.includes(normalized(p)))) reasons.push("text_copy_mismatch");
   break;
  }
  default:reasons.push("unknown_template");
 }
 // Also check language-bearing actions and security/billing notices. User song
 // titles, names, technical formats and URLs deliberately remain unconstrained.
 const extraHtml:string[]=[], extraText:string[]=[];
 if (auth) {
  if(language.template === "verification") {extraHtml.push(auth.verification.title,auth.verification.expiry);extraText.push(auth.verification.expiry);}
  if(language.template === "password_reset") {extraHtml.push(auth.reset.title,auth.reset.code,auth.reset.expiry);extraText.push(auth.reset.code,auth.reset.expiry);}
  if(language.template === "transcription_complete") extraHtml.push(auth.completion.action);
 }
 if(language.template === "inactive_signup") extraHtml.push(expected === "en" ? "Transcribe a song" : c.transcribe);
 if(language.template === "tab_return") extraHtml.push(expected === "en" ? "Continue your tab" : c.continue);
 if(language.template === "pro_started") extraHtml.push(expected === "en" ? "Start transcribing" : c.transcribe);
 if(language.template === "payment_failed") extraHtml.push(c.updatePayment);
 if((language.template === "trial_started" || language.template === "trial_ending") && expected !== "en") {extraHtml.push(c.settings);extraText.push(c.settings);}
 if(language.template === "contextual_reminder") {extraHtml.push(contextualReminderCopy[expected][0],contextualReminderCopy[expected][6]);extraText.push(contextualReminderCopy[expected][6]);}
 if((language.template === "inactive_signup" || language.template === "tab_return") && content.html.includes("/email/unsubscribe")) {extraHtml.push(c.unsubscribe);extraText.push(c.unsubscribe);}
 htmlPhrases.push(...extraHtml);textPhrases.push(...extraText);
 if (!subjects.some(s=>subjectMatches(subject,s))) reasons.push("subject_copy_mismatch");
 if (!htmlPhrases.every(p=>containsPhrase(html,p))) reasons.push("html_copy_mismatch");
 if (!content.text || !textPhrases.every(p=>containsPhrase(text,p))) reasons.push("text_copy_mismatch");
 return [...new Set(reasons)];
}
