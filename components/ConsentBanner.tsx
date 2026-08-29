import Link from "next/link";
import { useEffect, useState } from "react";
import {
  readConsentPreferences,
  writeConsentPreferences,
  type ConsentChoice,
} from "../lib/consentPreferences";
import { setPostHogConsent } from "../lib/posthogClient";

type DraftPreferences = {
  analytics: ConsentChoice;
  advertising: ConsentChoice;
};

const DENY_ALL: DraftPreferences = { analytics: "denied", advertising: "denied" };
const ACCEPT_ALL: DraftPreferences = { analytics: "granted", advertising: "granted" };

export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [draft, setDraft] = useState<DraftPreferences>(DENY_ALL);

  useEffect(() => {
    const current = readConsentPreferences();
    if (current) {
      setDraft({ analytics: current.analytics, advertising: current.advertising });
    } else {
      setVisible(true);
    }

    const open = () => {
      const saved = readConsentPreferences();
      setDraft(saved ? { analytics: saved.analytics, advertising: saved.advertising } : DENY_ALL);
      setCustomizing(true);
      setVisible(true);
    };
    window.addEventListener("note2tabs:open-consent", open);
    return () => window.removeEventListener("note2tabs:open-consent", open);
  }, []);

  const save = async (preferences: DraftPreferences) => {
    writeConsentPreferences(preferences);
    await setPostHogConsent(preferences.analytics);
    setDraft(preferences);
    setVisible(false);
    setCustomizing(false);
  };

  if (!visible) return null;

  return (
    <section className="consent-banner" aria-labelledby="privacy-choices-title">
      <div className="consent-banner__copy">
        <h2 id="privacy-choices-title">Your privacy choices</h2>
        <p>
          Essential technology keeps Note2Tabs working. With your permission, we also use analytics to improve the
          product and advertising technology to fund it. You can change your choice anytime.{" "}
          <Link href="/privacy">Privacy policy</Link>
        </p>
      </div>

      {customizing ? (
        <div className="consent-banner__preferences">
          <div className="consent-banner__option">
            <span><strong>Essential</strong><small>Sign-in, security and requested features.</small></span>
            <span className="consent-banner__always">Always on</span>
          </div>
          <label className="consent-banner__option">
            <span><strong>Analytics</strong><small>Usage measurement and optional session replay.</small></span>
            <input
              type="checkbox"
              checked={draft.analytics === "granted"}
              onChange={(event) => setDraft((value) => ({ ...value, analytics: event.target.checked ? "granted" : "denied" }))}
            />
          </label>
          <label className="consent-banner__option">
            <span><strong>Advertising</strong><small>Ad delivery, measurement and personalization.</small></span>
            <input
              type="checkbox"
              checked={draft.advertising === "granted"}
              onChange={(event) => setDraft((value) => ({ ...value, advertising: event.target.checked ? "granted" : "denied" }))}
            />
          </label>
          <div className="consent-banner__actions">
            <button type="button" className="button-secondary" onClick={() => void save(draft)}>Save choices</button>
            <button type="button" className="button-primary" onClick={() => void save(ACCEPT_ALL)}>Accept all</button>
          </div>
        </div>
      ) : (
        <div className="consent-banner__actions">
          <button type="button" className="button-ghost" onClick={() => void save(DENY_ALL)}>Reject optional</button>
          <button type="button" className="button-secondary" onClick={() => setCustomizing(true)}>Choose</button>
          <button type="button" className="button-primary" onClick={() => void save(ACCEPT_ALL)}>Accept all</button>
        </div>
      )}
    </section>
  );
}
