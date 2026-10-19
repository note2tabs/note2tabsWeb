import { useRef, useState, type FormEvent } from "react";
import { useLocale } from "../lib/i18n/react";
import { translatedError } from "../lib/i18n/translate";
import { AFFILIATE_APPLICATION_LIMITS as limits } from "../lib/affiliateApplication";
import { sendEvent } from "../lib/analytics";
import Link from "./LocaleLink";

export default function AffiliateApplicationForm() {
  const { t, locale } = useLocale();
  const startedAt = useRef(Date.now());
  const inFlight = useRef(false);
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || state === "success") return;
    inFlight.current = true;
    setState("submitting");
    setError("");
    const form = event.currentTarget, data = new FormData(form);
    try {
      let response: Response;
      try {
        response = await fetch("/api/affiliate/application", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: data.get("email"), profile: data.get("profile"), audience: data.get("audience"), message: data.get("message"), company: data.get("company"), startedAt: startedAt.current }) });
      } catch { throw new Error("We could not send your application. Please try again."); }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "We could not send your application. Please try again.");
      setState("success");
      form.reset();
      // Application answers, addresses and profile URLs never enter analytics.
      try { sendEvent("affiliate_application_submitted", { surface: "affiliate_program" }); } catch { /* Delivery succeeded; telemetry must not invite another submission. */ }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not send your application. Please try again.");
      setState("error");
    } finally { inFlight.current = false; }
  }
  return <section id="affiliate-application" className="affiliateApplication" aria-labelledby="affiliate-application-heading">
    <header><p className="affiliateInfoLabel">{t("Interested in partnering?")}</p>
      <h2 id="affiliate-application-heading">{t("Apply to become an affiliate")}</h2>
      <p>{t("We review partnerships individually and will reply with the next steps if there is a good fit.")}</p></header>
    {state === "success" ? <div role="status" className="affiliateApplicationSuccess"><h3>{t("Application sent")}</h3>
      <p>{t("Your application has reached the Note2Tabs team. We’ll contact you by email if there is a match.")}</p></div> :
    <form onSubmit={submit} className="internship-form">
      <div className="affiliateApplicationRow">
        <div className="internship-field"><label htmlFor="affiliate-email">{t("Email address")}</label><input id="affiliate-email" name="email" type="email" dir="ltr" autoComplete="email" maxLength={limits.email} required /></div>
        <div className="internship-field"><label htmlFor="affiliate-audience">{t("Audience size")} <span>{t("(optional)")}</span></label><input id="affiliate-audience" name="audience" maxLength={limits.audience} /></div>
      </div>
      <div className="internship-field"><label htmlFor="affiliate-profile">{t("Website or social profile")}</label><input id="affiliate-profile" name="profile" type="url" dir="ltr" inputMode="url" maxLength={limits.profile} required /></div>
      <div className="internship-field"><label htmlFor="affiliate-message">{t("How would you share Note2Tabs?")}</label><textarea id="affiliate-message" name="message" rows={3} maxLength={limits.message} required /><span className="internship-field__hint">{t("Tell us about you and your audience.")}</span></div>
      <div className="internship-honeypot" aria-hidden="true"><label>{t("Company")}<input name="company" tabIndex={-1} autoComplete="off" /></label></div>
      {state === "error" && <p className="internship-message internship-message--error" role="alert">{translatedError(error, locale)}</p>}
      <button className="affiliateInfoPrimary" type="submit" disabled={state === "submitting"}>{t(state === "submitting" ? "Sending application…" : "Submit application")}</button>
      <p className="internship-privacy">{t("By submitting, you agree that Note2Tabs may use this information to review your application. Read our ")}<Link href="/privacy">{t("Privacy Policy")}</Link>{t(".")}</p>
    </form>}
  </section>;
}
