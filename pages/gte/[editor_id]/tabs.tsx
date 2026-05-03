import { GetServerSideProps } from "next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { buildLaneEditorRef, gteApi } from "../../../lib/gteApi";
import NoIndexHead from "../../../components/NoIndexHead";

type Props = {
  editorId: string;
};

type EditorLane = {
  id: string;
  name: string;
};

const STRING_LABELS = ["e", "B", "G", "D", "A", "E"] as const;
const TAB_FONT_SIZE_MIN = 11;
const TAB_FONT_SIZE_MAX = 22;
const TAB_FONT_SIZE_STEP = 1;
const TAB_FONT_SIZE_DEFAULT = 14;

const parseEditorLanes = (value: unknown): EditorLane[] => {
  if (!value || typeof value !== "object") return [{ id: "ed-1", name: "Tab 1" }];
  const rawEditors = (value as { editors?: unknown }).editors;
  if (!Array.isArray(rawEditors) || rawEditors.length === 0) {
    return [{ id: "ed-1", name: "Tab 1" }];
  }
  return rawEditors.map((lane, index) => {
    const item = lane && typeof lane === "object" ? (lane as { id?: unknown; name?: unknown }) : {};
    const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `ed-${index + 1}`;
    const rawName = typeof item.name === "string" ? item.name.trim() : "";
    const defaultEditorName = `Editor ${index + 1}`;
    const name = !rawName || rawName === defaultEditorName ? `Tab ${index + 1}` : rawName;
    return { id, name };
  });
};

const withTuningPrefixes = (rawTabText: string) => {
  const lines = (rawTabText || "").split("\n");
  return lines
    .map((line, index) => {
      const label = STRING_LABELS[index];
      if (!label) return line;
      const trimmed = line.trimStart();
      if (trimmed.startsWith(`${label}|`)) return line;
      return `${label}|${line}`;
    })
    .join("\n");
};

export default function GteAsciiTabsPage({ editorId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabText, setTabText] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [tabFontSizePx, setTabFontSizePx] = useState(TAB_FONT_SIZE_DEFAULT);

  const hasTabText = useMemo(() => tabText.trim().length > 0, [tabText]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const editorData = await gteApi.getEditor(editorId);
        const lanes = parseEditorLanes(editorData);
        const parts: string[] = [];

        for (let index = 0; index < lanes.length; index += 1) {
          const lane = lanes[index];
          const laneRef = buildLaneEditorRef(editorId, lane.id);
          const laneAscii = await gteApi.exportAsciiTab(laneRef);
          const laneText = laneAscii.tabText ? withTuningPrefixes(laneAscii.tabText) : "No tabs available yet.";
          parts.push(`${lane.name}\n${laneText}`);
        }

        if (!active) return;
        setTabText(parts.join("\n\n"));
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Could not load ASCII tabs.";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [editorId]);

  const handleCopyTabs = async () => {
    if (!hasTabText || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(tabText);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      // Keep silent; UI stays unchanged if clipboard is unavailable.
    }
  };

  const increaseTabSize = () => {
    setTabFontSizePx((prev) => Math.min(TAB_FONT_SIZE_MAX, prev + TAB_FONT_SIZE_STEP));
  };

  const decreaseTabSize = () => {
    setTabFontSizePx((prev) => Math.max(TAB_FONT_SIZE_MIN, prev - TAB_FONT_SIZE_STEP));
  };

  return (
    <>
      <NoIndexHead title="txt tabs | Note2Tabs" canonicalPath={`/gte/${editorId}/tabs`} />
      <main className="content py-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void router.push(`/gte/${editorId}`)}
              className="button-secondary button-small"
            >
              Back to editor
            </button>
            <Link href="/gte" className="button-secondary button-small">
              Editors
            </Link>
          </div>

          <section className="py-1">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Tab view</h1>
            <p className="mt-2 text-sm text-slate-600">
              A clean text export of your guitar tab, ready to copy, save, or share.
            </p>
          </section>

          {loading && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
                <div className="h-8 w-24 animate-pulse rounded-md bg-slate-200" />
              </div>
              <div className="space-y-2 rounded-xl bg-slate-50 p-4">
                <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
                <div className="h-4 w-11/12 animate-pulse rounded bg-slate-200" />
                <div className="h-4 w-10/12 animate-pulse rounded bg-slate-200" />
                <div className="h-4 w-9/12 animate-pulse rounded bg-slate-200" />
                <div className="h-4 w-8/12 animate-pulse rounded bg-slate-200" />
              </div>
            </section>
          )}

          {error && !loading && (
            <section className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </section>
          )}

          {!loading && !error && (
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-700">Tabs</p>
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center overflow-hidden rounded-md border border-slate-200 bg-white">
                    <button
                      type="button"
                      onClick={decreaseTabSize}
                      className="h-7 w-7 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={tabFontSizePx <= TAB_FONT_SIZE_MIN}
                      aria-label="Shrink tabs"
                      title="Shrink tabs"
                    >
                      -
                    </button>
                    <span className="min-w-[3rem] border-l border-r border-slate-200 px-2 text-center text-xs text-slate-600">
                      {tabFontSizePx}px
                    </span>
                    <button
                      type="button"
                      onClick={increaseTabSize}
                      className="h-7 w-7 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={tabFontSizePx >= TAB_FONT_SIZE_MAX}
                      aria-label="Enlarge tabs"
                      title="Enlarge tabs"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopyTabs()}
                    disabled={!hasTabText}
                    className="button-secondary button-small disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {copyState === "copied" ? "Copied" : "Copy tabs"}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl bg-white p-4">
                <pre
                  className="m-0 whitespace-pre font-mono text-slate-800"
                  style={{
                    fontSize: `${tabFontSizePx}px`,
                    lineHeight: `${Math.max(16, Math.round(tabFontSizePx * 1.5))}px`,
                  }}
                >
                  {tabText || "No tabs available yet."}
                </pre>
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const rawEditorId = ctx.params?.editor_id;
  const editorId = typeof rawEditorId === "string" ? rawEditorId : "";
  if (!editorId) {
    return { notFound: true };
  }
  return {
    props: {
      editorId,
    },
  };
};
