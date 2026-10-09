import { useLocale } from "../../lib/i18n/react";
import Link from "../../components/LocaleLink";
import { useLocaleRouter as useRouter } from "../../lib/i18n/react";
import { useState } from "react";
import NoIndexHead from "../../components/NoIndexHead";

export default function ShareEmailPreferencesPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function block() {
    const token = typeof router.query.token === "string" ? router.query.token : "";
    if (!token) return setStatus("error");
    setStatus("saving");
    const response = await fetch("/api/email/block-tab-shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setStatus(response.ok ? "done" : "error");
  }

  return <>
    <NoIndexHead title={t("Sharing email preferences | Note2Tabs")} canonicalPath="/email/share-preferences" />
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f6f3ea" }}>
      <section style={{ width: "min(520px, 100%)", padding: 32, border: "1px solid #dedbd2", borderRadius: 18, background: "white" }}>
        <h1 style={{ marginTop: 0 }}>{t("Sharing email preferences")}</h1>
        {status === "done" ? <>
          <p>{t("Note2Tabs will no longer send tab-sharing invitations to this email address.")}</p>
          <Link href="/">{t("Return to Note2Tabs")}</Link>
        </> : <>
          <p>{t("Block future emails sent when someone shares a Note2Tabs tab with this address.")}</p>
          <p>{t("This does not remove access that has already been shared.")}</p>
          {status === "error" && <p role="alert">{t("This link could not be used. Please try again.")}</p>}
          <button type="button" onClick={block} disabled={status === "saving"}>
            {t(status === "saving" ? "Updating…" : "Block sharing emails")}
          </button>
        </>}
      </section>
    </main>
  </>;
}
