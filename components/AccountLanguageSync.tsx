import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "../lib/i18n/react";
import { browserLanguageChoice, saveLanguageChoice } from "../lib/i18n/preference";
import { validLocale } from "../lib/i18n/preference";

/** Language is an account preference, independent of analytics/marketing consent. */
export default function AccountLanguageSync() {
  const { data: session, status } = useSession();
  const { navigationLocale, languageReady } = useLocale();
  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id || !languageReady) return;
    let active = true, revision = 0, applying = false;
    let queue = Promise.resolve();
    const sync = (initialize: boolean) => {
      if (applying) return;
      const locale = browserLanguageChoice() || navigationLocale;
      const generation = ++revision;
      // Serialize changes so a slower earlier request cannot overwrite the last choice.
      queue = queue.then(async () => {
        if (!active) return;
        try {
          const response = await fetch("/api/account/language", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ locale, initialize }), signal: AbortSignal.timeout(8000) });
          if (!response.ok) return;
          const saved = validLocale((await response.json()).locale);
          if (active && generation === revision && saved && saved !== browserLanguageChoice()) {
            applying = true; saveLanguageChoice(saved); applying = false;
          }
        } catch { /* Language loading and the editor remain usable during an outage. */ }
      });
    };
    const changed = () => sync(false);
    sync(true);
    window.addEventListener("note2tabs:locale-changed", changed);
    return () => { active = false; window.removeEventListener("note2tabs:locale-changed", changed); };
  }, [status, session?.user?.id, languageReady]);
  return null;
}
