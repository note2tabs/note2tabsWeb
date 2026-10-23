import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "../lib/i18n/react";

const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALES = ["Major", "Minor", "Harmonic Minor", "Melodic Minor", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Major Blues", "Minor Blues"];
const control = "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/50 disabled:opacity-40";
const group = "flex shrink-0 items-center gap-1 border-r border-slate-200 pr-2 mr-1";
const active = " !border-emerald-600/40 !bg-emerald-100 !text-emerald-900";
export function MidiToolIcon({ kind }: { kind: "select" | "draw" | "undo" | "redo" | "key" | "fit" | "selection" | "view" | "more" }) {
  if (kind === "undo" || kind === "redo") return <span aria-hidden="true" className="h-4 w-4 shrink-0 bg-current" style={{ maskImage: `url(/icons/${kind}-transparent.png)`, WebkitMaskImage: `url(/icons/${kind}-transparent.png)`, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }} />;
  const paths = { select: "m4 2 12 9-6 1-3 6z", draw: "m3 13 10-10 4 4L7 17l-5 1zM11 5l4 4", undo: "m7 3-5 5 5 5M2 8h10a5 5 0 0 1 0 10", redo: "m13 3 5 5-5 5M18 8H8a5 5 0 0 0 0 10", key: "M12 2v11a3 2 0 1 1-2-2V3l6-1v4", fit: "M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4", selection: "M6 3H3v3m7-3h2m5 0h-2m2 3v3m0 4v4h-3m-4 0H7m-4 0v-4m0-4V7", view: "M3 5h14M3 10h14M3 15h14M7 3v4m6 1v4m-5 1v4", more: "M4 10h.01M10 10h.01M16 10h.01" };
  return <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>;
}

type Props = {
  mode: "select" | "draw"; disabled: boolean; onMode: (mode: "select" | "draw") => void;
  onUndo?: () => void; onRedo?: () => void; undoCount?: number; redoCount?: number;
  grid: number; triplet: boolean; onGrid: (grid: number, triplet: boolean) => void;
  keyBase: number; keyType: number; onKeyChange?: (base: number, type: number) => void;
  snapToKey: boolean; onSnapToKey?: (enabled: boolean) => void;
  voice: 1 | 2; onVoice: (voice: 1 | 2) => void;
  hasSelection: boolean; onFitAll: () => void; onFitSelection: () => void;
  zoom: number; row: number; onZoom: (zoom: number) => void; onRow: (row: number) => void;
  follow: boolean; onFollow: (enabled: boolean) => void;
  audition: boolean; onAudition: (enabled: boolean) => void;
  labels: boolean; onLabels: (enabled: boolean) => void; onCenter: () => void;
};

export default function GteMidiToolbar(props: Props) {
  const { t } = useLocale(), root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1100), [open, setOpen] = useState<"view" | "more" | null>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(null); };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);
  const showHistory = width >= 420, showKey = width >= 650, showVoice = width >= 850, showFits = width >= 1050;
  const iconButton = (label: string, icon: Parameters<typeof MidiToolIcon>[0]["kind"], action: () => void, disabled = false, pressed?: boolean) =>
    <button type="button" aria-label={t(label.split(" · ")[0])} title={t(label)} disabled={disabled} aria-pressed={pressed} className={control + " w-8 !px-0" + (pressed ? active : "")} onClick={action}><MidiToolIcon kind={icon} /></button>;
  const history = <div role="group" aria-label={t("History")} className="flex gap-1">{iconButton("Undo · Ctrl+Z", "undo", () => props.onUndo?.(), props.disabled || !props.onUndo || props.undoCount === 0)}{iconButton("Redo · Ctrl+Shift+Z", "redo", () => props.onRedo?.(), props.disabled || !props.onRedo || props.redoCount === 0)}</div>;
  const keyControl = <div role="group" aria-label={t("Key and pitch constraint")} className="flex min-w-0 items-center gap-1">
    <select aria-label={t("MIDI key")} title={t("Key signature")} className={control + " max-w-44"} value={`${props.keyBase}:${props.keyType}`} disabled={props.disabled || !props.onKeyChange}
      onChange={event => { const [base, type] = event.target.value.split(":").map(Number); props.onKeyChange?.(base, type); }}>
      {SCALES.map((scale, type) => <optgroup key={scale} label={t(scale)}>{ROOTS.map((root, base) => <option key={base} value={`${base}:${type}`}>{root} {t(scale)}</option>)}</optgroup>)}
    </select>
    {iconButton("Snap to key · Alt for chromatic notes", "key", () => props.onSnapToKey?.(!props.snapToKey), props.disabled || !props.onSnapToKey, props.snapToKey)}
  </div>;
  const voiceControl = <select aria-label={t("MIDI voice")} title={t("Voice")} className={control} value={props.voice} disabled={props.disabled} onChange={event => props.onVoice(Number(event.target.value) as 1 | 2)}><option value={1}>{t("Voice")} 1</option><option value={2}>{t("Voice")} 2</option></select>;
  const fits = <>{[false, true].map(selection => <button key={String(selection)} type="button" className={control} title={t(selection ? "Fit selection · Shift+F" : "Fit all notes · F")} disabled={selection && !props.hasSelection} onClick={selection ? props.onFitSelection : props.onFitAll}><MidiToolIcon kind={selection ? "selection" : "fit"} />{t(selection ? "Fit selection" : "Fit all")}</button>)}</>;
  const percentage = (value: number) => `${value < 1 ? value.toFixed(2) : Math.round(value)}%`;
  const panel = (children: ReactNode) => <div className="absolute right-0 top-full z-50 mt-1 grid w-64 max-w-[calc(100vw-2rem)] gap-3 overflow-y-auto rounded-xl border border-slate-200 bg-[#faf9f5] p-3 text-xs text-slate-600 shadow-lg" style={{ maxHeight: Math.max(120, window.innerHeight - (root.current?.getBoundingClientRect().bottom ?? 0) - 104) }}>{children}</div>;
  return <div ref={root} role="toolbar" aria-label={t("MIDI tools")} data-gte-floating-ui="true" data-gte-editor-control="true" className="relative z-40 flex min-w-0 shrink-0 flex-nowrap items-center gap-1 rounded-lg border border-slate-200 bg-[#faf9f5] p-1.5 text-xs"
    onKeyDown={event => { if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(null); root.current?.querySelector<HTMLButtonElement>(`[data-midi-menu="${open}"]`)?.focus(); } }}>
    <div role="group" aria-label={t("Editing mode")} className={group}>{iconButton("Select · Esc", "select", () => props.onMode("select"), false, props.mode === "select")}{iconButton("Draw · B", "draw", () => props.onMode("draw"), props.disabled, props.mode === "draw")}</div>
    {showHistory && <div className={group}>{history}</div>}
    <label className={group + " text-slate-500"}><span className={width < 420 ? "sr-only" : ""}>{t("Grid")}</span>
      <select aria-label={t("MIDI grid")} title={t("Grid resolution · always snapped")} className={control} value={`${props.grid}${props.triplet ? "T" : ""}`} onChange={event => props.onGrid(parseInt(event.target.value, 10), event.target.value.endsWith("T"))}>
        <optgroup label={t("Straight")}>{[1,2,4,8,16,32,64].map(value => <option key={value} value={String(value)}>1/{value}</option>)}</optgroup>
        <optgroup label={t("Triplets")}>{[1,2,4,8,16,32,64].map(value => <option key={value} value={`${value}T`}>1/{value}T</option>)}</optgroup>
      </select>
    </label>
    {showKey && <div className={group}>{keyControl}</div>}
    {showVoice && voiceControl}
    <div className="min-w-0 flex-1" />
    {showFits && <div role="group" aria-label={t("Fit actions")} className="flex shrink-0 gap-1">{fits}</div>}
    {(!showHistory || !showKey || !showVoice) && <div className="relative shrink-0">
      <button type="button" data-midi-menu="more" aria-label={t("More MIDI controls")} title={t("More MIDI controls")} aria-expanded={open === "more"} className={control + " w-8 !px-0"} onClick={() => setOpen(open === "more" ? null : "more")}><MidiToolIcon kind="more" /></button>
      {open === "more" && panel(<>{!showHistory && history}{!showKey && keyControl}{!showVoice && voiceControl}</>)}
    </div>}
    <div className="relative shrink-0">
      <button type="button" data-midi-menu="view" aria-expanded={open === "view"} className={control} onClick={() => setOpen(open === "view" ? null : "view")}><MidiToolIcon kind="view" />{t("View")}<span aria-hidden="true">⌄</span></button>
      {open === "view" && panel(<>
        <label className="grid gap-1"><span className="flex justify-between">{t("Horizontal zoom")}<output>{percentage(props.zoom / 240 * 100)}</output></span><input type="range" aria-label={t("MIDI zoom")} aria-valuetext={percentage(props.zoom / 240 * 100)} min={0.02} max={800} step={0.02} value={props.zoom / 240 * 100} onChange={event => props.onZoom(Number(event.target.value) * 240 / 100)} /></label>
        <label className="grid gap-1"><span className="flex justify-between">{t("Vertical zoom")}<output>{percentage(props.row / 18 * 100)}</output></span><input type="range" aria-label={t("Pitch row height")} aria-valuetext={percentage(props.row / 18 * 100)} min={6} max={36} step={1} value={props.row} onChange={event => props.onRow(Number(event.target.value))} /></label>
        <div className="grid grid-cols-2 gap-1">{fits}</div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={props.follow} onChange={event => props.onFollow(event.target.checked)} />{t("Follow playback")}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={props.labels} onChange={event => props.onLabels(event.target.checked)} />{t("Note labels")}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={props.audition} onChange={event => props.onAudition(event.target.checked)} />{t("Audition while dragging")}</label>
        <button type="button" className={control} onClick={props.onCenter}>{t("Center playhead · Home")}</button>
      </>)}
    </div>
  </div>;
}
