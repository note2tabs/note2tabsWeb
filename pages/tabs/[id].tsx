import { useEffect, useMemo, useState } from "react";
import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { prisma } from "../../lib/prisma";
import { copyText } from "../../lib/clipboard";
import { gteApi } from "../../lib/gteApi";
import { parseStoredTabPayload, type StoredTranscriberSegmentGroup } from "../../lib/storedTabs";
import type { EditorListItem } from "../../types/gte";

type Props = {
  id: string;
  sourceLabel: string;
  createdAt: string;
  tabs: string[][];
  transcriberSegments: StoredTranscriberSegmentGroup[];
  backendJobId: string | null;
};

export default function TabDetailPage({ id, sourceLabel, createdAt, tabs, transcriberSegments, backendJobId }: Props) {
  const router = useRouter();
  const [selectedSegments, setSelectedSegments] = useState<Set<number>>(new Set());
  const [editorChoices, setEditorChoices] = useState<EditorListItem[]>([]);
  const [editorChoice, setEditorChoice] = useState("new");
  const [editorLoading, setEditorLoading] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const appendEditorId = useMemo(() => {
    if (!router.isReady) return null;
    const value = router.query.appendEditorId;
    if (Array.isArray(value)) return value[0]?.trim() || null;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }, [router.isReady, router.query.appendEditorId]);
  const selectedTabs = useMemo(
    () => (selectedSegments.size > 0 ? tabs.filter((_, idx) => selectedSegments.has(idx)) : tabs),
    [tabs, selectedSegments]
  );

  useEffect(() => {
    setEditorLoading(true);
    gteApi
      .listEditors()
      .then((data) => {
        const editors = data.editors || [];
        setEditorChoices(editors);
        if (appendEditorId && editors.some((editor) => editor.id === appendEditorId)) {
          setEditorChoice(appendEditorId);
        } else {
          setEditorChoice("new");
        }
      })
      .catch(() => {
        setEditorChoices([]);
        setEditorChoice("new");
      })
      .finally(() => {
        setEditorLoading(false);
      });
  }, [appendEditorId]);

  const getSelectedTranscriberGroups = () => {
    if (transcriberSegments.length === 0) return null;
    const indexes =
      selectedSegments.size > 0
        ? Array.from(selectedSegments).sort((a, b) => a - b)
        : transcriberSegments.map((_, idx) => idx);
    const groups = indexes
      .map((idx) => transcriberSegments[idx])
      .filter((group): group is StoredTranscriberSegmentGroup => Array.isArray(group) && group.length > 0);
    return groups.length > 0 ? groups : null;
  };

  const handleImportToEditor = async () => {
    if (importBusy || tabs.length === 0) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const selectedTranscriberGroups = getSelectedTranscriberGroups();
      if (!selectedTranscriberGroups) {
        throw new Error("This saved transcription is missing transcriber segment data.");
      }
      const imported = await gteApi.importTranscriberToSaved({
        target: !editorChoice || editorChoice === "new" ? "new" : "existing",
        editorId: !editorChoice || editorChoice === "new" ? undefined : editorChoice,
        name: sourceLabel || "Imported transcription",
        segmentGroups: selectedTranscriberGroups,
      });
      await router.push(`/gte/${imported.editorId}?source=saved-tab&tabId=${encodeURIComponent(id)}`);
    } catch (err: any) {
      setImportError(err?.message || "Failed to import tabs.");
    } finally {
      setImportBusy(false);
    }
  };

  const joined = selectedTabs.map((segment) => segment.join("\n")).join("\n\n---\n\n");
  const reviewHref = backendJobId
    ? appendEditorId
      ? `/job/${encodeURIComponent(backendJobId)}?review=1&appendEditorId=${encodeURIComponent(appendEditorId)}`
      : `/job/${encodeURIComponent(backendJobId)}?review=1`
    : null;

  return (
    <main className="page">
      <div className="container stack">
        <div className="page-header">
          <div className="stack" style={{ gap: "6px" }}>
            <h1 className="page-title">Import saved tabs</h1>
            <p className="muted text-small">{sourceLabel}</p>
            <p className="muted text-small">{new Date(createdAt).toLocaleString()}</p>
          </div>
          <div className="button-row">
            <Link href="/tabs" className="button-secondary button-small">
              Back to saved tabs
            </Link>
            {reviewHref ? (
              <Link href={reviewHref} className="button-secondary button-small">
                Edit transcription
              </Link>
            ) : null}
            <Link href="/account" className="button-secondary button-small">
              Account
            </Link>
          </div>
        </div>

        <section className="results" id="results">
          <div className="container results-shell" style={{ paddingInline: 0 }}>
            <div className="results-header">
              <div>
                <h2>Your tabs are ready</h2>
                <p>Pick the tab blocks you want to import or copy.</p>
              </div>
              <div className="results-actions">
                <div className="flex flex-wrap items-center gap-2">
                  {reviewHref ? (
                    <Link href={reviewHref} className="button-secondary button-small">
                      Edit transcription
                    </Link>
                  ) : null}
                  <select
                    className="rounded-md border border-slate-200 bg-white px-2 py-2 text-sm"
                    value={editorChoice}
                    onChange={(event) => setEditorChoice(event.target.value)}
                    disabled={editorLoading}
                  >
                    <option value="new">New editor</option>
                    {editorChoices.map((editor) => (
                      <option key={editor.id} value={editor.id}>
                        {editor.name ? editor.name : `${editor.id.slice(0, 8)}...`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => void handleImportToEditor()}
                    disabled={importBusy || editorLoading}
                  >
                    {importBusy ? "Importing..." : "Import to editor"}
                  </button>
                </div>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    void copyText(joined);
                  }}
                >
                  Copy tabs
                </button>
              </div>
            </div>
            {importError && <div className="error">{importError}</div>}
            <div className="results-grid">
              {tabs.map((segment, idx) => {
                const selected = selectedSegments.has(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      setSelectedSegments((prev) => {
                        const next = new Set(prev);
                        if (next.has(idx)) {
                          next.delete(idx);
                        } else {
                          next.add(idx);
                        }
                        return next;
                      })
                    }
                    className={`tab-block text-left transition ${
                      selected ? "ring-2 ring-emerald-400/80 bg-emerald-50/60" : ""
                    }`}
                  >
                    <pre className="tab-block-content">{segment.join("\n")}</pre>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id) {
    return {
      redirect: {
        destination: "/auth/login",
        permanent: false,
      },
    };
  }
  const id = ctx.params?.id as string;
  const job = await prisma.tabJob.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!job) {
    return { notFound: true };
  }

  const parsed = parseStoredTabPayload(job.resultJson);
  if (parsed.transcriberSegments.length === 0) {
    return { notFound: true };
  }

  return {
    props: {
      id,
      sourceLabel: job.sourceLabel || "Unknown source",
      createdAt: job.createdAt.toISOString(),
      tabs: parsed.tabs,
      transcriberSegments: parsed.transcriberSegments,
      backendJobId: parsed.backendJobId || null,
    },
  };
};
