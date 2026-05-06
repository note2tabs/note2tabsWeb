import { GetServerSideProps } from "next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { gteApi } from "../../../lib/gteApi";
import { buildTabTextFromSnapshot } from "../../../lib/gteTabText";
import NoIndexHead from "../../../components/NoIndexHead";
import type { CanvasSnapshot, EditorSnapshot } from "../../../types/gte";

type Props = {
  editorId: string;
};

type EditorLane = {
  id: string;
  name: string;
  snapshot: EditorSnapshot;
};
type LaneTabText = {
  id: string;
  label: string;
  title: string;
  text: string;
  snapshot: EditorSnapshot;
};

const TAB_FONT_SIZE_MIN = 5;
const TAB_FONT_SIZE_MAX = 22;
const TAB_FONT_SIZE_STEP = 1;
const TAB_FONT_SIZE_DEFAULT = 14;
const SPOTS_PER_BAR_MIN = 4;
const SPOTS_PER_BAR_MAX = 64;
const BARS_PER_LINE_MIN = 1;
const BARS_PER_LINE_MAX = 12;

const isEditorSnapshot = (value: unknown): value is EditorSnapshot =>
  Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as EditorSnapshot).notes) &&
      Array.isArray((value as EditorSnapshot).chords)
  );

const parseEditorLanes = (value: unknown): EditorLane[] => {
  const defaultNamePattern = /^(editor|transcription)\s+\d+$/i;
  if (value && typeof value === "object" && Array.isArray((value as CanvasSnapshot).editors)) {
    const lanes = (value as CanvasSnapshot).editors;
    if (!lanes.length) return [];
    return lanes.map((lane, index) => {
      const id = typeof lane.id === "string" && lane.id.trim() ? lane.id.trim() : `ed-${index + 1}`;
      const rawName = typeof lane.name === "string" ? lane.name.trim() : "";
      const name = !rawName || defaultNamePattern.test(rawName) ? `Tab ${index + 1}` : rawName;
      return { id, name, snapshot: lane };
    });
  }

  if (isEditorSnapshot(value)) {
    const rawName = typeof value.name === "string" ? value.name.trim() : "";
    const name = !rawName || defaultNamePattern.test(rawName) ? "Tab 1" : rawName;
    return [{ id: value.id || "ed-1", name, snapshot: value }];
  }

  return [];
};

export default function GteAsciiTabsPage({ editorId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [laneTabs, setLaneTabs] = useState<LaneTabText[]>([]);
  const [collapsedLaneIds, setCollapsedLaneIds] = useState<Record<string, boolean>>({});
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [laneCopyState, setLaneCopyState] = useState<Record<string, "idle" | "copied">>({});
  const [targetLaneId, setTargetLaneId] = useState<string | null>(null);
  const [tabFontSizePx, setTabFontSizePx] = useState(TAB_FONT_SIZE_DEFAULT);
  const [spotsPerBar, setSpotsPerBar] = useState(16);
  const [barsPerLine, setBarsPerLine] = useState(3);

  const targetLane = useMemo(
    () => laneTabs.find((lane) => lane.id === targetLaneId) ?? laneTabs[0] ?? null,
    [laneTabs, targetLaneId]
  );
  const hasTabText = useMemo(() => Boolean(targetLane && targetLane.text.trim().length > 0), [targetLane]);

  const copyTextReliable = async (value: string) => {
    const text = value || "";
    if (!text) return false;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // fall through to legacy copy fallback
      }
    }
    if (typeof document === "undefined") return false;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    document.body.removeChild(textarea);
    return copied;
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const editorData = await gteApi.getEditor(editorId);
        const lanes = parseEditorLanes(editorData);
        if (!lanes.length) {
          throw new Error("No tracks found in editor.");
        }
        const nextTabs = lanes.map((lane, index) => ({
          id: lane.id,
          label: `Tab ${index + 1}`,
          title: lane.name,
          text: buildTabTextFromSnapshot(lane.snapshot, {
            barsPerRow: barsPerLine,
            barWidth: spotsPerBar * 2,
          }),
          snapshot: lane.snapshot,
        }));

        if (!active) return;
        setLaneTabs(nextTabs);
        setCollapsedLaneIds((prev) => {
          const next: Record<string, boolean> = {};
          nextTabs.forEach((lane) => {
            next[lane.id] = prev[lane.id] ?? false;
          });
          return next;
        });
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
  }, [barsPerLine, editorId, spotsPerBar]);

  const handleCopyTabs = async () => {
    if (!targetLane) return;
    const payload = `${targetLane.title}\n${targetLane.text || "No tabs available yet."}`;
    const copied = await copyTextReliable(payload);
    if (!copied) return;
    setCopyState("copied");
    setLaneCopyState((prev) => ({ ...prev, [targetLane.id]: "copied" }));
    window.setTimeout(() => {
      setCopyState("idle");
      setLaneCopyState((prev) => ({ ...prev, [targetLane.id]: "idle" }));
    }, 1500);
  };

  const handleCopySingleTab = async (lane: LaneTabText) => {
    const payload = `${lane.title}\n${lane.text || "No tabs available yet."}`;
    const copied = await copyTextReliable(payload);
    if (!copied) return;
    setTargetLaneId(lane.id);
    setCopyState("copied");
    setLaneCopyState((prev) => ({ ...prev, [lane.id]: "copied" }));
    window.setTimeout(() => {
      setCopyState("idle");
      setLaneCopyState((prev) => ({ ...prev, [lane.id]: "idle" }));
    }, 1500);
  };

  const increaseTabSize = () => {
    setTabFontSizePx((prev) => Math.min(TAB_FONT_SIZE_MAX, prev + TAB_FONT_SIZE_STEP));
  };

  const decreaseTabSize = () => {
    setTabFontSizePx((prev) => Math.max(TAB_FONT_SIZE_MIN, prev - TAB_FONT_SIZE_STEP));
  };
  const increaseSpotsPerBar = () => {
    setSpotsPerBar((prev) => Math.min(SPOTS_PER_BAR_MAX, prev + 1));
  };
  const decreaseSpotsPerBar = () => {
    setSpotsPerBar((prev) => Math.max(SPOTS_PER_BAR_MIN, prev - 1));
  };
  const increaseBarsPerLine = () => {
    setBarsPerLine((prev) => Math.min(BARS_PER_LINE_MAX, prev + 1));
  };
  const decreaseBarsPerLine = () => {
    setBarsPerLine((prev) => Math.max(BARS_PER_LINE_MIN, prev - 1));
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
                  <div className="inline-flex items-center overflow-hidden rounded-full border border-slate-200 bg-white">
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
                  <div className="inline-flex items-center overflow-hidden rounded-full border border-slate-200 bg-white">
                    <button
                      type="button"
                      onClick={decreaseSpotsPerBar}
                      className="h-7 w-7 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={spotsPerBar <= SPOTS_PER_BAR_MIN}
                      aria-label="Decrease ticks per bar"
                      title="Decrease ticks per bar"
                    >
                      -
                    </button>
                    <span className="min-w-[5rem] border-l border-r border-slate-200 px-2 text-center text-xs text-slate-600">
                      {spotsPerBar} ticks/bar
                    </span>
                    <button
                      type="button"
                      onClick={increaseSpotsPerBar}
                      className="h-7 w-7 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={spotsPerBar >= SPOTS_PER_BAR_MAX}
                      aria-label="Increase spots per bar"
                      title="Increase spots per bar"
                    >
                      +
                    </button>
                  </div>
                  <div className="inline-flex items-center overflow-hidden rounded-full border border-slate-200 bg-white">
                    <button
                      type="button"
                      onClick={decreaseBarsPerLine}
                      className="h-7 w-7 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={barsPerLine <= BARS_PER_LINE_MIN}
                      aria-label="Decrease bars per line"
                      title="Decrease bars per line"
                    >
                      -
                    </button>
                    <span className="min-w-[5rem] border-l border-r border-slate-200 px-2 text-center text-xs text-slate-600">
                      {barsPerLine} bars
                    </span>
                    <button
                      type="button"
                      onClick={increaseBarsPerLine}
                      className="h-7 w-7 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={barsPerLine >= BARS_PER_LINE_MAX}
                      aria-label="Increase bars per line"
                      title="Increase bars per line"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                {laneTabs.map((lane) => {
                  const collapsed = Boolean(collapsedLaneIds[lane.id]);
                  return (
                    <div key={lane.id}>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-slate-700">{lane.title}</p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleCopySingleTab(lane)}
                              className="button-secondary button-small"
                            >
                              {laneCopyState[lane.id] === "copied" ? "Copied" : "Copy"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setCollapsedLaneIds((prev) => ({ ...prev, [lane.id]: !Boolean(prev[lane.id]) }))
                              }
                              className="button-secondary button-small"
                              aria-expanded={!collapsed}
                              aria-controls={`lane-tab-${lane.id}`}
                            >
                              {collapsed ? "Maximize" : "Minimize"}
                            </button>
                          </div>
                        </div>
                        {!collapsed && (
                          <div id={`lane-tab-${lane.id}`} className="overflow-x-auto">
                            <pre
                              className="m-0 whitespace-pre font-mono text-slate-800"
                              style={{
                                fontSize: `${tabFontSizePx}px`,
                                lineHeight: `${Math.max(16, Math.round(tabFontSizePx * 1.5))}px`,
                              }}
                            >
                              {lane.text || "No tabs available yet."}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
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
