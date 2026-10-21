import Head from "next/head";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useLocale, useLocaleRouter } from "../../lib/i18n/react";
import { translatedError } from "../../lib/i18n/translate";
import { gteApi } from "../../lib/gteApi";
import { GTE_GUEST_EDITOR_ID } from "../../lib/gteGuestDraft";
import { withEditorLocale } from "../../lib/i18n/editor/request";

/** Creation happens only after navigation, never during link prefetching. */
export default function NewEditorPage() {
  const { status } = useSession();
  const router = useLocaleRouter();
  const { t, locale } = useLocale();
  const started = useRef(false);
  const createdEditorId = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const start = useCallback(async () => {
    if (status === "loading" || router.isReady === false || started.current) return;
    started.current = true;
    setError(null);
    try {
      const editorId = status === "authenticated"
        ? (createdEditorId.current ?? (createdEditorId.current = (await gteApi.createEditor()).editorId))
        : GTE_GUEST_EDITOR_ID;
      // Replace the entry route so Back cannot create another blank tab.
      const navigated = await router.replace(`/gte/${editorId}${router.query?.track === "bass" ? "?track=bass" : ""}`);
      if (navigated === false) throw new Error("We could not start a new tab. Check your connection and try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not start a new tab. Check your connection and try again.");
      started.current = false;
    }
  }, [status, router]);
  useEffect(() => { if (!error) void start(); }, [start, error]);
  return <>
    <Head><meta name="robots" content="noindex,nofollow" /></Head>
    <main className="container" style={{ paddingBlock: 64 }}>
      {error ? <><p role="alert">{translatedError(error, locale)}</p><button type="button" className="button-primary" onClick={() => void start()}>{t("Try again")}</button></>
        : <p role="status">{t("Starting...")}</p>}
    </main>
  </>;
}

export const getServerSideProps = withEditorLocale(async () => ({ props: {} }));
