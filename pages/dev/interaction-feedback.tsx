import Link from "next/link";
import { useRef, useState } from "react";
import NoIndexHead from "../../components/NoIndexHead";

type Notice = { tone: "success" | "error"; text: string } | null;

export default function InteractionFeedbackPreviewPage() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [toggleOn, setToggleOn] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finishAfterDelay = (result: Notice) => {
    if (busy) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setBusy(true);
    setNotice(null);
    timerRef.current = setTimeout(() => {
      setBusy(false);
      setNotice(result);
      timerRef.current = setTimeout(() => setNotice(null), 3000);
    }, 1200);
  };

  const copyDemo = async () => {
    setNotice(null);
    try {
      await navigator.clipboard.writeText("https://www.note2tabs.com/?ref=DEMO");
      setNotice({ tone: "success", text: "Copied to your clipboard." });
    } catch {
      setNotice({ tone: "error", text: "Copy failed. Check your browser permission and try again." });
    }
  };

  return (
    <>
      <NoIndexHead
        title="Interaction Feedback Preview | Note2Tabs"
        canonicalPath="/dev/interaction-feedback"
        description="Internal preview of Note2Tabs interaction feedback states."
      />
      <main className="interaction-preview-page">
        <div className="interaction-preview-shell">
          <header className="interaction-preview-header">
            <span>Internal preview</span>
            <h1>Interaction feedback</h1>
            <p>Click, hold, tab through, and activate these controls with Enter or Space.</p>
          </header>

          <section className="interaction-preview-card">
            <div className="interaction-preview-card__heading">
              <div><span>01</span><h2>Buttons and links</h2></div>
              <small>Hover · press · keyboard focus</small>
            </div>
            <div className="interaction-preview-row">
              <button type="button" className="button-primary" onClick={() => setNotice({ tone: "success", text: "Primary action received." })}>Primary action</button>
              <button type="button" className="button-secondary" onClick={() => setNotice({ tone: "success", text: "Secondary action received." })}>Secondary action</button>
              <button type="button" className="interaction-preview-plain" onClick={() => setNotice({ tone: "success", text: "Plain icon control received." })} aria-label="Favorite"><span aria-hidden="true">☆</span> Plain control</button>
              <Link href="#fields" className="interaction-preview-link">Text link →</Link>
            </div>
          </section>

          <section className="interaction-preview-card">
            <div className="interaction-preview-card__heading">
              <div><span>02</span><h2>Loading and completion</h2></div>
              <small>Immediate lock · progress · result</small>
            </div>
            <div className="interaction-preview-row">
              <button type="button" className="button-primary" disabled={busy} aria-busy={busy} onClick={() => finishAfterDelay({ tone: "success", text: "The sample action finished successfully." })}>{busy ? "Saving…" : "Test successful action"}</button>
              <button type="button" className="button-secondary" disabled={busy} aria-busy={busy} onClick={() => finishAfterDelay({ tone: "error", text: "The sample action failed. Nothing was changed—please try again." })}>{busy ? "Working…" : "Test failed action"}</button>
              <button type="button" className="button-secondary" disabled>Unavailable action</button>
            </div>
          </section>

          <section className="interaction-preview-card" id="fields">
            <div className="interaction-preview-card__heading">
              <div><span>03</span><h2>Fields and selection</h2></div>
              <small>Focus · selected · disabled</small>
            </div>
            <div className="interaction-preview-fields">
              <label className="form-group"><span className="label">Tab name</span><input className="form-input" defaultValue="My new tab" /></label>
              <label className="form-group"><span className="label">Instrument</span><select className="form-select" defaultValue="guitar"><option value="guitar">Guitar</option><option value="bass">Bass</option><option value="drums">Drums</option></select></label>
            </div>
            <div className="interaction-preview-row">
              <button type="button" className={`interaction-preview-toggle ${toggleOn ? "is-active" : ""}`} aria-pressed={toggleOn} onClick={() => setToggleOn((value) => !value)}><span aria-hidden="true" /> Snap to grid {toggleOn ? "on" : "off"}</button>
              <details className="interaction-preview-menu"><summary>Open menu</summary><div><button type="button" onClick={() => setNotice({ tone: "success", text: "Menu option selected." })}>Menu option</button><button type="button" onClick={() => setNotice({ tone: "success", text: "Another option selected." })}>Another option</button></div></details>
            </div>
          </section>

          <section className="interaction-preview-card">
            <div className="interaction-preview-card__heading">
              <div><span>04</span><h2>Clipboard feedback</h2></div>
              <small>Success and permission failure</small>
            </div>
            <div className="interaction-preview-copy"><code>note2tabs.com/?ref=DEMO</code><button type="button" onClick={() => void copyDemo()}>Copy link</button></div>
            <button type="button" className="interaction-preview-failure" onClick={() => setNotice({ tone: "error", text: "Could not copy automatically. Select the link and copy it manually." })}>Preview blocked-copy message</button>
          </section>

          <div className={`interaction-preview-notice ${notice ? `is-visible is-${notice.tone}` : ""}`} role="status" aria-live="polite" aria-atomic="true">{notice?.text || ""}</div>
        </div>
      </main>
    </>
  );
}
