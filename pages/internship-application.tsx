import { translatedError } from "../lib/i18n/translate";
import { useLocale } from "../lib/i18n/react";
import Link from "../components/LocaleLink";
import { cloneElement, FormEvent, ReactElement, useRef, useState } from "react";
import SeoHead from "../components/SeoHead";
import { ANALYTICS_EVENTS, sendEvent } from "../lib/analytics";
import { INTERNSHIP_APPLICATION_LIMITS } from "../lib/internshipApplication";

type FormState = "idle" | "submitting" | "success" | "error";

export default function InternshipApplicationPage() {
  const { t, locale } = useLocale();
  const startedAt = useRef(Date.now());
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "submitting") return;
    setState("submitting");
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const response = await fetch("/api/internship-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          program: data.get("program"),
          studyYear: data.get("studyYear"),
          presentation: data.get("presentation"),
          portfolio: data.get("portfolio"),
          linkedIn: data.get("linkedIn"),
          company: data.get("company"),
          startedAt: startedAt.current,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "We could not send your application. Please try again.");
      setState("success");
      sendEvent(ANALYTICS_EVENTS.internshipApplicationSubmitted);
      form.reset();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "We could not send your application. Please try again.");
      setState("error");
    }
  }

  return (
    <>
      <SeoHead title={t("Internship application | Note2Tabs")} description="Apply for an internship with Note2Tabs." canonicalPath="/internship-application" noindex nofollow />
      <main className="internship-page">
        <div className="internship-decoration internship-decoration--notes" aria-hidden="true">{t("♪ ♫")}</div>
        <div className="internship-decoration internship-decoration--staff" aria-hidden="true"><span /><span /><span /><span /><span /></div>
        <section className="internship-card" aria-labelledby="internship-title">
          {state === "success" ? (
            <div className="internship-success" role="status">
              <span className="internship-success__mark" aria-hidden="true">{t("✓")}</span>
              <p className="internship-eyebrow">{t("Application sent")}</p>
              <h1 id="internship-title">{t("Thank you for applying.")}</h1>
              <p>{t("Your application has reached the Note2Tabs team. We’ll contact you by email if there is a match.")}</p>
            </div>
          ) : (
            <>
              <header className="internship-header">
                <p className="internship-eyebrow">{t("Join Note2Tabs")}</p>
                <h1 id="internship-title">{t("Internship application")}</h1>
                <p>{t("Tell us what you study, what you care about, and how you would like to contribute.")}</p>
              </header>
              <form className="internship-form" onSubmit={submit}>
                <Field label="Email address"><input name="email" type="email" autoComplete="email" maxLength={INTERNSHIP_APPLICATION_LIMITS.email} required /></Field>
                <div className="internship-form__row">
                  <Field label="Program / major"><input name="program" type="text" autoComplete="organization-title" maxLength={INTERNSHIP_APPLICATION_LIMITS.program} required /></Field>
                  <Field label="Year of study"><input name="studyYear" type="text" maxLength={INTERNSHIP_APPLICATION_LIMITS.studyYear} required /></Field>
                </div>
                <Field label="Short presentation" hint="What interests you about Note2Tabs, and what would you like to work on?"><textarea name="presentation" rows={5} maxLength={INTERNSHIP_APPLICATION_LIMITS.presentation} required /></Field>
                <Field label="Past work / portfolio" optional><textarea name="portfolio" rows={3} maxLength={INTERNSHIP_APPLICATION_LIMITS.portfolio} /></Field>
                <Field label="LinkedIn profile" optional><input name="linkedIn" type="url" inputMode="url" placeholder={t("https://linkedin.com/in/...")} maxLength={INTERNSHIP_APPLICATION_LIMITS.linkedIn} /></Field>
                <div className="internship-honeypot" aria-hidden="true"><label>{t("Company")}<input name="company" type="text" tabIndex={-1} autoComplete="off" /></label></div>
                {state === "error" && <p className="internship-message internship-message--error" role="alert">{translatedError(error, locale)}</p>}
                <button className="internship-submit" type="submit" disabled={state === "submitting"}>{t(state === "submitting" ? "Sending application…" : "Submit application")}</button>
                <p className="internship-privacy">{t("By submitting, you agree that Note2Tabs may use this information to review your application. Read our ")}<Link href="/privacy">{t("Privacy Policy")}</Link>{t(".")}</p>
              </form>
            </>
          )}
        </section>
      </main>
    </>
  );
}

function Field({ label, hint, optional = false, children }: { label: string; hint?: string; optional?: boolean; children: ReactElement<{ id?: string }> }) {
  const { t, locale } = useLocale();
  const id = `internship-${label.toLowerCase().replace(/[^a-z]+/g, "-").replace(/(^-|-$)/g, "")}`;
  return <div className="internship-field"><label htmlFor={id}>{t(label)} {optional && <span>{t("(optional)")}</span>}</label>{cloneElement(children, { id })}{hint && <span className="internship-field__hint">{t(hint)}</span>}</div>;
}
