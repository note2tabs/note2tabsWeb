import { useRouter } from "next/router";
import { useState } from "react";
import Link from "next/link";

export default function ReminderUnsubscribePage() {
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
    <section style={{ width: "min(520px, 100%)", padding: 32, border: "1px solid #dedbd2", borderRadius: 18, background: "white" }}>
      <h1 style={{ marginTop: 0 }}>Email preferences</h1>
      {status === "done" ? <><p>You will no longer receive inactivity or return-to-tab reminders.</p><Link href="/home">Return to Note2Tabs</Link></> : <>
        <p>Stop occasional emails reminding you to begin or return to a tab. Essential account and billing emails will continue.</p>
        {status === "error" && <p role="alert">This link could not be used. Please try again.</p>}
        <button type="button" onClick={unsubscribe} disabled={status === "saving"}>{status === "saving" ? "Updating…" : "Stop reminder emails"}</button>
      </>}
    </section>
  </main>;
}
