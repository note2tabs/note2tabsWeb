import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import type { EmbeddedTabPayload } from "../../../types/embedTabs";
import { isValidEmbedIdentifier } from "../../../lib/embedIdentifiers";

type Props = {
  shareId: string;
};

const SECRET_STORAGE_PREFIX = "note2tabs:embed-secret:";
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 18;

const readSecret = (shareId: string) => {
  if (typeof window === "undefined") return null;
  const fromHash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : "";
  const validHashSecret = /^[A-Za-z0-9_-]{32,128}$/.test(fromHash) ? fromHash : null;
  try {
    if (validHashSecret) {
      window.sessionStorage.setItem(`${SECRET_STORAGE_PREFIX}${shareId}`, validHashSecret);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      return validHashSecret;
    }
    const stored = window.sessionStorage.getItem(`${SECRET_STORAGE_PREFIX}${shareId}`);
    return stored && /^[A-Za-z0-9_-]{32,128}$/.test(stored) ? stored : null;
  } catch {
    return validHashSecret;
  }
};

export default function EmbeddedTabPage({ shareId }: Props) {
  const [payload, setPayload] = useState<EmbeddedTabPayload | null>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(13);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const secret = readSecret(shareId);
    if (!secret) {
      setError("This embedded tab is unavailable.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/embed/tabs/${encodeURIComponent(shareId)}`, {
          headers: { Authorization: `Bearer ${secret}` },
          cache: "no-cache",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            response.status === 429
              ? "This tab is receiving too many requests. Please try again shortly."
              : "This embedded tab is unavailable."
          );
        }
        const data = (await response.json()) as EmbeddedTabPayload;
        if (!Array.isArray(data.tracks) || data.tracks.length === 0) {
          throw new Error("This embedded tab has no tracks yet.");
        }
        setPayload(data);
        setActiveTrackId(data.tracks[0].id);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "This embedded tab is unavailable.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [shareId]);

  const activeTrack = useMemo(
    () => payload?.tracks.find((track) => track.id === activeTrackId) || payload?.tracks[0] || null,
    [activeTrackId, payload]
  );

  return (
    <>
      <Head>
        <title>{payload?.title ? `${payload.title} | Note2Tabs` : "Embedded tab | Note2Tabs"}</title>
        <meta name="robots" content="noindex,nofollow,noarchive,nosnippet" />
        <meta name="googlebot" content="noindex,nofollow,noarchive,nosnippet" />
      </Head>
      <main className="min-h-screen bg-[#f7f4ed] p-2 text-slate-900 sm:p-3" data-nosnippet>
        <section className="mx-auto flex min-h-[22rem] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#fffdf8] shadow-[0_16px_45px_rgba(15,23,42,0.09)]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <img src="/logo-mark-96.png" width="20" height="20" alt="" aria-hidden="true" />
                <span>Note2Tabs</span>
              </div>
              <h1 className="mt-1 truncate text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                {payload?.title || "Guitar tab"}
              </h1>
              {payload ? (
                <p className="mt-1 text-xs text-slate-500">
                  {payload.bpm ? `${payload.bpm} BPM · ` : ""}{payload.timeSignature}
                </p>
              ) : null}
            </div>
            <a
              href="/editor?utm_source=embedded_tab&utm_medium=widget&utm_campaign=editor"
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Make your own tab
            </a>
          </header>

          {loading ? (
            <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5" role="status" aria-label="Loading embedded tab">
              <div className="h-7 w-48 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-11/12 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-10/12 animate-pulse rounded bg-slate-100" />
            </div>
          ) : error ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center" role="alert">
              <div>
                <p className="text-sm font-medium text-slate-700">{error}</p>
                <p className="mt-2 text-xs text-slate-500">The owner may have revoked this embed.</p>
              </div>
            </div>
          ) : payload && activeTrack ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 sm:px-5">
                <div className="flex max-w-full gap-1 overflow-x-auto py-0.5" role="tablist" aria-label="Tab tracks">
                  {payload.tracks.map((track) => (
                    <button
                      key={track.id}
                      type="button"
                      role="tab"
                      aria-selected={track.id === activeTrack.id}
                      onClick={() => setActiveTrackId(track.id)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        track.id === activeTrack.id
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {track.name}
                    </button>
                  ))}
                </div>
                <div
                  className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white"
                  role="group"
                  aria-label="Tab text size"
                >
                  <button
                    type="button"
                    onClick={() => setFontSize((current) => Math.max(MIN_FONT_SIZE, current - 1))}
                    disabled={fontSize <= MIN_FONT_SIZE}
                    className="h-8 w-8 text-sm text-slate-600 hover:bg-slate-50 disabled:text-slate-300"
                  >
                    <span aria-hidden="true">−</span>
                    <span className="sr-only">Decrease tab text size</span>
                  </button>
                  <span className="w-10 text-center text-[11px] tabular-nums text-slate-500">{fontSize}px</span>
                  <button
                    type="button"
                    onClick={() => setFontSize((current) => Math.min(MAX_FONT_SIZE, current + 1))}
                    disabled={fontSize >= MAX_FONT_SIZE}
                    className="h-8 w-8 text-sm text-slate-600 hover:bg-slate-50 disabled:text-slate-300"
                  >
                    <span aria-hidden="true">+</span>
                    <span className="sr-only">Increase tab text size</span>
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto bg-white p-3 sm:p-5">
                <pre
                  role="tabpanel"
                  className="m-0 min-w-max whitespace-pre font-mono leading-[1.55] text-slate-800"
                  style={{ fontSize }}
                >
                  {activeTrack.tabText}
                </pre>
                {activeTrack.truncated ? (
                  <p className="mt-4 text-xs text-slate-500">This preview shows the first part of a very large track.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const shareId = Array.isArray(ctx.params?.share_id) ? ctx.params?.share_id[0] : ctx.params?.share_id;
  if (!isValidEmbedIdentifier(shareId)) return { notFound: true };
  ctx.res.setHeader("Cache-Control", "private, no-store, max-age=0");
  ctx.res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  return { props: { shareId } };
};
