import { stripeClient } from "../stripe";
import { createPostHogServerClient } from "../posthogServer";
import type { AppLocale } from "./locale";
/** Stripe Invoicing lacks Arabic; our own Arabic emails remain fully localized. */
export function stripeEmailLocales(locale: AppLocale): string[] {
  return [locale === "ar" ? "en" : locale === "zh-Hans" ? "zh-CN" : locale];
}
export class StripeEmailLanguageError extends Error {
  constructor() {super("Stripe email language preference could not be confirmed");this.name="StripeEmailLanguageError";}
}
async function reportStripeLanguageFailure(locale:AppLocale, stage:"create"|"update"|"lookup", accountId?:string) {
  const error=new StripeEmailLanguageError();
  const properties={alert_eligible:true,error_classification:"email_language_mismatch",email_template:"stripe_billing",expected_locale:locale,
    provider_locale:stripeEmailLocales(locale)[0],delivery_stage:`stripe_preference_${stage}_failed`,environment:process.env.VERCEL_ENV || process.env.NODE_ENV || "development"};
  console.error("stripe_email_language_mismatch",properties);
  try {const ph=createPostHogServerClient();if(ph)await ph.captureExceptionImmediate(error,accountId || "system:stripe-email-language",properties);}
  catch {console.warn("stripe_email_language_alert_delivery_failed");}
  return error;
}
export async function setStripeEmailLanguage(customerId: string, locale: AppLocale) {
  if (!stripeClient) return;
  try {
    const customer=await stripeClient.customers.update(customerId,{preferred_locales:stripeEmailLocales(locale)});
    if(customer.preferred_locales?.[0] !== stripeEmailLocales(locale)[0])throw new StripeEmailLanguageError();
  } catch {throw await reportStripeLanguageFailure(locale,"update");}
}
export async function syncStripeEmailLanguage(email: string, locale: AppLocale) {
  if (!stripeClient) return;
  try {
    // Match only the signed-in account's verified address; no caller-provided ID.
    for await (const customer of stripeClient.customers.list({ email, limit: 100 })) {
      if (customer.preferred_locales?.[0] !== stripeEmailLocales(locale)[0]) await setStripeEmailLanguage(customer.id, locale);
    }
  } catch(error) {if(error instanceof StripeEmailLanguageError)throw error;throw await reportStripeLanguageFailure(locale,"lookup");}
}
