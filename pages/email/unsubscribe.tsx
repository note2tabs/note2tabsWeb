import SeoHead from "../../components/SeoHead";
import { useLocale } from "../../lib/i18n/react";
import { useLocaleRouter as useRouter } from "../../lib/i18n/react";
import { useState } from "react";
import Link from "../../components/LocaleLink";

export default function ReminderUnsubscribePage() {
  const { t } = useLocale();
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const unsubscribe = async () => {
    const token = typeof router.query.token === "string" ? router.query.token : "";
    if (!token) return setStatus("error");
    setStatus("saving");
    const response = await fetch("/api/email/unsubscribe-reminders", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
    });
    setStatus(response.ok ? "done" : "error");
  };
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f6f3ea" }}>
    <SeoHead title={t("Email preferences")} canonicalPath="/email/unsubscribe" noindex />
    <section style={{ width: "min(520px, 100%)", padding: 32, border: "1px solid #dedbd2", borderRadius: 18, background: "white" }}>
      <h1 style={{ marginTop: 0 }}>{t("Email preferences")}</h1>
      {status === "done" ? <><p>{t("You will no longer receive inactivity or return-to-tab reminders.")}</p><Link href="/home">{t("Return to Note2Tabs")}</Link></> : <>
        <p>{t("Stop occasional emails reminding you to begin or return to a tab. Essential account and billing emails will continue.")}</p>
        {status === "error" && <p role="alert">{t("This link could not be used. Please try again.")}</p>}
        <button type="button" onClick={unsubscribe} disabled={status === "saving"}>{t(status === "saving" ? "Updating…" : "Stop reminder emails")}</button>
      </>}
    </section>
  </main>;
}
