import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../api/auth/[...nextauth]";
import NoIndexHead from "../../../components/NoIndexHead";
import { copyText } from "../../../lib/clipboard";
import { isValidEmbedIdentifier } from "../../../lib/embedIdentifiers";
import type { CreatedEmbedShare, EmbedShareSummary } from "../../../types/embedTabs";

type Props = {
  editorId: string;
};

const shareDateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const readError = async (response: Response) => {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error;
  } catch {
    // Use the controlled fallback below.
  }
  return "Something went wrong. Please try again.";
};

export default function EditorEmbedSettingsPage({ editorId }: Props) {
  const [shares, setShares] = useState<EmbedShareSummary[]>([]);
  const [createdShare, setCreatedShare] = useState<CreatedEmbedShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [copied, setCopied] = useState<"url" | "iframe" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/embed/shares?editorId=${encodeURIComponent(editorId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await readError(response));
        const data = (await response.json()) as { shares?: EmbedShareSummary[] };
        setShares(Array.isArray(data.shares) ? data.shares : []);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Could not load embeds.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [editorId]);

  const createShare = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/embed/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editorId }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const created = (await response.json()) as CreatedEmbedShare;
      setCreatedShare(created);
      setShares((current) => [created.share, ...current.filter((share) => share.id !== created.share.id)]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create an embed.");
    } finally {
      setCreating(false);
    }
  };

  const revokeShare = async (shareId: string) => {
    if (revokingId) return;
    setRevokingId(shareId);
    setError(null);
    try {
      const response = await fetch(`/api/embed/shares/${encodeURIComponent(shareId)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await readError(response));
      setShares((current) => current.filter((share) => share.id !== shareId));
      setCreatedShare((current) => (current?.share.id === shareId ? null : current));
      setConfirmingId(null);
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Could not revoke this embed.");
    } finally {
      setRevokingId(null);
    }
  };

  const copyValue = async (kind: "url" | "iframe", value: string) => {
    if (!(await copyText(value))) {
      setError("Copy was blocked by your browser. Select the text and copy it manually.");
      return;
    }
    setCopied(kind);
    window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1600);
  };

  return (
    <>
      <NoIndexHead
        title="Embed tab | Note2Tabs"
        canonicalPath={`/gte/${editorId}/embed`}
        description="Create and revoke read-only embeds for your Note2Tabs editor."
      />
      <main className="content py-8 sm:py-12">
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Share</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Embed this tab</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Add a responsive, read-only version of this editor to another website. It never includes your account details or source audio.
              </p>
            </div>
            <Link href={`/gte/${editorId}`} className="button-secondary button-small">
              Back to editor
            </Link>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Create an embed</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">
                  Anyone with the embed code can view the tab. The private key is shown once, and you can revoke access at any time.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void createShare()}
                disabled={creating || shares.length >= 5}
                className="button-primary button-small"
              >
                {creating ? "Creating..." : "Create embed"}
              </button>
            </div>

            {error ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
                {error}
              </div>
            ) : null}

            {createdShare ? (
              <div className="ph-no-capture mt-5 space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 sm:p-5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Your embed is ready</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Copy this now. For security, Note2Tabs cannot show the private key again after you leave this page.
                  </p>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-600">Direct embed link</span>
                  <span className="flex flex-col gap-2 sm:flex-row">
                    <input
                      readOnly
                      value={createdShare.embedUrl}
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700"
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <button
                      type="button"
                      onClick={() => void copyValue("url", createdShare.embedUrl)}
                      className="button-secondary button-small shrink-0"
                    >
                      {copied === "url" ? "Copied" : "Copy link"}
                    </button>
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-600">Website code</span>
                  <textarea
                    readOnly
                    value={createdShare.iframeHtml}
                    rows={4}
                    className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs leading-5 text-slate-700"
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button
                    type="button"
                    onClick={() => void copyValue("iframe", createdShare.iframeHtml)}
                    className="button-secondary button-small mt-2"
                  >
                    {copied === "iframe" ? "Copied" : "Copy website code"}
                  </button>
                </label>
                <div>
                  <p className="mb-2 text-xs font-medium text-slate-600">Preview</p>
                  <iframe
                    src={createdShare.embedUrl}
                    title="Embedded tab preview"
                    className="h-[480px] w-full rounded-2xl border border-slate-200 bg-white"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  />
                </div>
              </div>
            ) : null}
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Active embeds</h2>
                <p className="mt-1 text-sm text-slate-600">Revoke a code to stop it from loading immediately.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {shares.length}/5
              </span>
            </div>

            {loading ? (
              <div className="mt-5 space-y-3" role="status" aria-label="Loading active embeds">
                <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
              </div>
            ) : shares.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                No active embeds yet.
              </div>
            ) : (
              <ul className="mt-5 divide-y divide-slate-100">
                {shares.map((share) => (
                  <li key={share.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        Key fingerprint {share.tokenFingerprint}…
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Created {shareDateFormatter.format(new Date(share.createdAt))}
                      </p>
                    </div>
                    {confirmingId === share.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          disabled={revokingId === share.id}
                          className="button-secondary button-small"
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          onClick={() => void revokeShare(share.id)}
                          disabled={revokingId === share.id}
                          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
                        >
                          {revokingId === share.id ? "Revoking..." : "Confirm revoke"}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingId(share.id)}
                        className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      >
                        Revoke
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id) {
    return {
      redirect: {
        destination: "/auth/login",
        permanent: false,
      },
    };
  }
  const editorId = Array.isArray(ctx.params?.editor_id) ? ctx.params?.editor_id[0] : ctx.params?.editor_id;
  if (!isValidEmbedIdentifier(editorId) || editorId === "local") return { notFound: true };
  return { props: { editorId } };
};
