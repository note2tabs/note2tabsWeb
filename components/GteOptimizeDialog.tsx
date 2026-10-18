import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CutWithCoord, EditorSnapshot } from "../types/gte";
import { coordinateEditorResult, createCoordinateEditorDraft, generateCoordinateEditorPositions, optimizationAnchorString, optimizationRange, type OptimizeOptions, type OptimizeScope, type OptimizeSelection } from "../lib/gteOptimization";
import { DEFAULT_COORDINATE_GENERATION_SETTINGS } from "../lib/gtePlayingCoordinates";
import { createCoordinatePreview } from "../lib/gteCoordinatePreview";
import { getMaxFretFromSnapshot, getOpenStringMidiFromSnapshot } from "../lib/gteTuning";
import { useLocale } from "../lib/i18n/react";

const fieldClass = "h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700";

export default function GteOptimizeDialog({ snapshot, selection, onCancel, onApply, error, busy = false, renderCoordinateEditor }: {
  snapshot: EditorSnapshot; selection: OptimizeSelection; onCancel: () => void; onApply: (options: OptimizeOptions) => void; error?: string | null; busy?: boolean;
  renderCoordinateEditor: (draft: EditorSnapshot, onChange: (next: EditorSnapshot) => void, cutting: boolean, end: number) => ReactNode;
}) {
  const { t } = useLocale();
  const [position, setPosition] = useState<"automatic" | "chosen">("automatic");
  const [scope, setScope] = useState<OptimizeScope>(selection.noteIds.length + selection.chordIds.length ? "selected" : "track");
  const [fretInput, setFretInput] = useState(() => String(Math.min(5, getMaxFretFromSnapshot(snapshot))));
  const [custom, setCustom] = useState(false);
  const [cuts, setCuts] = useState<CutWithCoord[]>([]);
  const [editingCuts, setEditingCuts] = useState<CutWithCoord[] | null>(null);
  const [coordinateDraft, setCoordinateDraft] = useState<EditorSnapshot | null>(null);
  const [coordinateCutting, setCoordinateCutting] = useState(false);
  const [generationSettings, setGenerationSettings] = useState({ ...DEFAULT_COORDINATE_GENERATION_SETTINGS });
  const rootRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<ReturnType<typeof createCoordinatePreview> | null>(null);
  const previewSourceRef = useRef<EditorSnapshot | null>(null);
  const initialFocus = useRef<HTMLElement | null>(null);
  const range = useMemo(() => optimizationRange(snapshot, selection, scope), [snapshot, selection, scope]);
  const strings = getOpenStringMidiFromSnapshot(snapshot);
  const stringLabels = strings.map((midi) => ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][midi % 12]);
  const maxFret = getMaxFretFromSnapshot(snapshot), fret = Number(fretInput);
  const validFret = fretInput.trim() !== "" && Number.isInteger(fret) && fret >= 0 && fret <= maxFret;
  const chosen = position === "chosen";

  useEffect(() => {
    initialFocus.current = document.activeElement as HTMLElement | null;
    rootRef.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    return () => initialFocus.current?.focus();
  }, []);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    (root.querySelector("[data-coordinate-editor]") ?? root).querySelector<HTMLElement>("button:not(:disabled), input:not(:disabled)")?.focus();
  }, [Boolean(editingCuts)]);

  const changeScope = (next: OptimizeScope) => { setScope(next); setCuts([]); setCustom(false); };
  const openEditor = () => {
    const initial = structuredClone(cuts.length ? cuts : standardCuts());
    setEditingCuts(initial);
    const source = createCoordinateEditorDraft(snapshot, selection, scope, initial);
    previewSourceRef.current = source;
    previewRef.current = source ? createCoordinatePreview(source, scope === "selected" ? selection : undefined) : null;
    setCoordinateDraft(source && previewRef.current ? previewRef.current.update(source.cutPositionsWithCoords).snapshot : null);
    setCoordinateCutting(false);
  };
  const closeEditor = () => { setEditingCuts(null); setCoordinateDraft(null); setCoordinateCutting(false); previewRef.current = null; previewSourceRef.current = null; };
  const updatePreview = (next: EditorSnapshot) => {
    setCoordinateDraft(previewRef.current?.update(next.cutPositionsWithCoords).snapshot ?? next);
  };
  const scopeLabel = scope === "track" ? t("Whole track") : t("Selected notes/chords");
  const standardCuts = (): CutWithCoord[] => range ? [[[range.start, range.end], [optimizationAnchorString(snapshot), validFret ? fret : 5]]] : [];

  return (
    <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-slate-950/25 p-4" data-gte-floating-ui="true" data-gte-optimization-dialog="true"
      onMouseDown={(event) => { event.stopPropagation(); if (event.target === event.currentTarget && !editingCuts) onCancel(); }}>
      <div ref={rootRef} role="dialog" aria-modal="true" aria-labelledby="gte-optimize-title"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-[#fffefa] p-5 text-slate-700 shadow-xl"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") { event.preventDefault(); if (editingCuts) closeEditor(); else onCancel(); }
          if (event.key === "Tab") {
            const container = editingCuts ? rootRef.current?.querySelector<HTMLElement>("[data-coordinate-editor]") : rootRef.current;
            const items = container?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex='0']");
            if (!items?.length) return;
            const first = items[0], last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          }
        }}>
        <h2 id="gte-optimize-title" className="text-base font-semibold text-slate-900">{t("Optimize")}</h2>
        <div className="mt-4 grid gap-4" inert={editingCuts ? true : undefined}>
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-slate-600">{t("Fret positions")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["automatic", "chosen"] as const).map((mode) => <button key={mode} type="button" aria-pressed={position === mode} onClick={() => setPosition(mode)}
                className={`rounded-lg border px-3 py-2 text-sm ${position === mode ? "border-sky-400 bg-sky-50 text-sky-800" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                {mode === "automatic" ? t("Automatic") : t("Chosen fret position")}
              </button>)}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-slate-600">{t("Apply to")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["selected", "track"] as const).map((value) => <button key={value} type="button" aria-pressed={scope === value}
                disabled={value === "selected" && selection.noteIds.length + selection.chordIds.length === 0} onClick={() => changeScope(value)}
                className={`rounded-lg border px-3 py-2 text-sm disabled:opacity-40 ${scope === value ? "border-sky-400 bg-sky-50 text-sky-800" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                {value === "selected" ? t("Selected notes/chords") : t("Whole track")}
              </button>)}
            </div>
          </fieldset>
          {chosen && <div className="grid gap-3 border-t border-slate-200 pt-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>{t("Preferred fret")} <span className="text-xs text-slate-500">({stringLabels[optimizationAnchorString(snapshot)]})</span></span>
              <input type="number" min={0} max={maxFret} step={1} value={fretInput} onChange={(event) => setFretInput(event.target.value)} className={`${fieldClass} w-20`} />
            </label>
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={custom} className="accent-sky-600" onChange={(event) => {
                setCustom(event.target.checked);
                if (event.target.checked && !cuts.length) setCuts(standardCuts());
              }} />{t("Custom fret positions")}</label>
              <button type="button" disabled={!custom || !range} onClick={openEditor} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-40">{t("Edit")}</button>
            </div>
          </div>}
          <p className="text-xs leading-5 text-slate-500">{t("Simultaneous notes are merged into chords and optimized together.")}</p>
          {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">{t("Cancel")}</button>
            <button type="button" disabled={busy || !range || (chosen && !validFret)} onClick={() => onApply({ scope, position, fret: validFret ? fret : 5, custom: chosen && custom, cuts })}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">{t("Optimize")}</button>
          </div>
        </div>

        {editingCuts && coordinateDraft && range && <div className="fixed inset-0 z-[10041] flex items-center justify-center bg-slate-950/25 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="gte-coordinate-editor-title" data-coordinate-editor="true"
            className="flex max-h-[calc(100dvh-3rem)] w-full max-w-5xl flex-col rounded-xl border border-slate-200 bg-[#fffefa] p-4 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h3 id="gte-coordinate-editor-title" className="text-sm font-semibold text-slate-900">{t("Custom fret positions")}</h3>
              <span className="text-xs text-slate-500">{scopeLabel}</span>
            </div>
            <div className="my-3 flex items-center gap-3">
              <div className="relative flex shrink-0">
                <button type="button" onClick={() => { updatePreview(generateCoordinateEditorPositions(previewSourceRef.current ?? coordinateDraft, range.end - range.start, generationSettings)); setCoordinateCutting(false); }}
                  className="h-8 rounded-l-md border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50">{t("Generate fret positions")}</button>
                <details className="group">
                  <summary aria-label={t("Fret position generation settings")} title={t("Generation settings")}
                    className="flex h-8 cursor-pointer list-none items-center rounded-r-md border border-l-0 border-slate-200 bg-white px-2 text-slate-600 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">▾</summary>
                  <div className="absolute left-0 top-full z-50 mt-1 w-64 space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg">
                    {([
                      ["cutThreshold", "Cut threshold", 3, 6, 0.25],
                      ["smoothing", "Smoothing (frames)", 40, 120, 10],
                      ["barsPerChunk", "Bars per analysis window", 2, 8, 1],
                    ] as const).map(([key, label, min, max, step]) => <label key={key} className="block space-y-1">
                      <span className="flex items-center justify-between gap-3"><span>{t(label)}</span><output className="tabular-nums text-slate-800">{generationSettings[key]}</output></span>
                      <input aria-label={t(label)} type="range" min={min} max={max} step={step} value={generationSettings[key]}
                        onChange={(event) => { const value = event.target.valueAsNumber; if (Number.isFinite(value)) setGenerationSettings((current) => ({ ...current, [key]: Math.max(min, Math.min(max, value)) })); }}
                        className="block h-5 w-full cursor-pointer accent-sky-600" />
                    </label>)}
                    <p className="text-[11px] leading-4 text-slate-500">{t("Lower thresholds create more boundaries. Changes apply when you generate.")}</p>
                    <button type="button" onClick={() => setGenerationSettings({ ...DEFAULT_COORDINATE_GENERATION_SETTINGS })} className="text-slate-700 underline">{t("Reset defaults")}</button>
                  </div>
                </details>
              </div>
              <button type="button" onClick={() => {
                updatePreview({ ...coordinateDraft, cutPositionsWithCoords: [[[0, range.end - range.start], [optimizationAnchorString(snapshot), validFret ? fret : 5]]] });
                setCoordinateCutting(false);
              }} className="h-8 shrink-0 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50">{t("Reset fret positions")}</button>
              <button type="button" aria-pressed={coordinateCutting} onClick={() => setCoordinateCutting((value) => !value)}
                className={`rounded-md border px-3 py-1.5 text-xs ${coordinateCutting ? "border-sky-400 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-600"}`}>
                {t("Cut")}
              </button>
              <p className="text-xs text-slate-500">{t("Click a coordinate to edit it. Drag boundaries to move them; right-click a boundary to merge.")}</p>
            </div>
            <div data-gte-coordinate-preview="true" className="min-h-0 overflow-auto"
              onMouseDownCapture={(event) => {
                if (!(event.target as Element).closest("[data-gte-playing-coordinate='true'], [data-gte-coordinate-editor-control='true']")) { event.preventDefault(); event.stopPropagation(); }
              }}
              onClickCapture={(event) => {
                if (!(event.target as Element).closest("[data-gte-playing-coordinate='true'], [data-gte-coordinate-editor-control='true']")) { event.preventDefault(); event.stopPropagation(); }
              }}
              onContextMenuCapture={(event) => {
                if (!(event.target as Element).closest("[data-gte-playing-coordinate='true'], [data-gte-coordinate-editor-control='true']")) { event.preventDefault(); event.stopPropagation(); }
              }}>
              {renderCoordinateEditor(coordinateDraft, updatePreview, coordinateCutting, range.end - range.start)}
            </div>
            <div className="mt-4 flex shrink-0 justify-end gap-2">
              <button type="button" onClick={closeEditor} className="rounded-md border border-slate-200 px-3 py-2 text-sm">{t("Cancel")}</button>
              <button type="button" onClick={() => { setCuts(coordinateEditorResult(coordinateDraft, range.start, range.end)); closeEditor(); }} className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white">{t("Done")}</button>
            </div>
          </div>
        </div>}
      </div>
    </div>
  );
}
