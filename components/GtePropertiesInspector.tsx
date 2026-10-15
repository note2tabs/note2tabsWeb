import { forwardRef, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../lib/i18n/react";
import { placePropertiesInspector, sameInspectorFingering } from "../lib/gtePropertiesInspector";
import type { TabCoord } from "../types/gte";

const controlClass = "h-9 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400";
const actionClass = "inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400";

function InspectorIcon({ kind }: { kind: "note" | "chord" | "trash" | "check" }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {kind === "note" ? <><path d="M10 18V5l10-2v13M10 8l10-2" /><ellipse cx="6.5" cy="18" rx="3.5" ry="2.5" /><ellipse cx="16.5" cy="16" rx="3.5" ry="2.5" /></> : kind === "chord" ? <><path d="M6 4v16M12 4v16M18 4v16M3 8h18M3 16h18" /><circle cx="6" cy="12" r="2" /><circle cx="12" cy="8" r="2" /><circle cx="18" cy="16" r="2" /></> : kind === "trash" ? <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></> : <path d="m5 12 4 4L19 6" />}
  </svg>;
}

type ShellProps = {
  title: string;
  context: string;
  contextTitle?: string;
  kind: "note" | "chord";
  objectKey: string;
  geometryKey: string;
  anchor: { x: number; y: number };
  mobile: boolean;
  onClose: () => void;
  children: ReactNode;
  compact?: boolean;
};

export const PropertiesInspectorShell = forwardRef<HTMLDivElement, ShellProps>(function PropertiesInspectorShell(
  { title, context, contextTitle, kind, objectKey, geometryKey, anchor, mobile, onClose, children, compact = false }, forwardedRef,
) {
  const { t } = useLocale();
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [placement, setPlacement] = useState<ReturnType<typeof placePropertiesInspector> | null>(null);
  useEffect(() => {
    if (mobile) return;
    let raf = 0;
    const measure = () => {
      const obstacles = Array.from(document.querySelectorAll<HTMLElement>(`[data-gte-inspector-object="${CSS.escape(objectKey)}"]`))
        .map((element) => element.getBoundingClientRect());
      const preferredHeight = compact
        ? Math.min(620, (panelRef.current?.firstElementChild?.getBoundingClientRect().height ?? 0) + (panelRef.current?.lastElementChild?.scrollHeight ?? 0) + 2)
        : 0;
      const next = placePropertiesInspector({ width: document.documentElement.clientWidth, height: window.innerHeight }, obstacles, anchor, preferredHeight);
      setPlacement((prev) => prev && prev.left === next.left && prev.top === next.top && prev.maxHeight === next.maxHeight && prev.width === next.width ? prev : next);
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    const observer = new ResizeObserver(schedule);
    if (panelRef.current) observer.observe(panelRef.current);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true); };
  }, [anchor.x, anchor.y, compact, geometryKey, mobile, objectKey]);
  if (typeof document === "undefined") return null;
  return createPortal(<div
    ref={(element) => { panelRef.current = element; if (typeof forwardedRef === "function") forwardedRef(element); else if (forwardedRef) forwardedRef.current = element; }}
    role="dialog"
    aria-modal="false"
    aria-labelledby={headingId}
    data-gte-floating-ui="true"
    data-gte-editor-control="true"
    data-gte-properties-inspector="true"
    className={`fixed z-[9999] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-[0_8px_32px_rgba(15,23,42,0.12)] ${mobile ? "inset-x-2 bottom-2 mx-auto max-h-[48dvh] w-[min(calc(100vw-1rem),28rem)]" : ""}`}
    style={mobile ? undefined : placement ? { left: placement.left, top: placement.top, width: placement.width, maxHeight: placement.maxHeight } : { visibility: "hidden", width: 320 }}
    onMouseDown={(event) => event.stopPropagation()}
    onTouchStart={(event) => event.stopPropagation()}
    onKeyDown={(event) => {
      // Fields may consume Escape to discard their draft before dismissing.
      if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); closeRef.current(); }
      if ((event.target as HTMLElement).closest("input, select, textarea") || ["Escape", "Enter", " "].includes(event.key)) event.stopPropagation();
    }}
  >
    <div className={`flex shrink-0 items-start gap-2.5 border-b border-slate-100 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
      <span className={`mt-0.5 rounded-md p-1.5 ${kind === "note" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}><InspectorIcon kind={kind} /></span>
      <div className="min-w-0 flex-1"><h2 id={headingId} className="text-sm font-semibold">{title}</h2><p title={contextTitle} className="mt-0.5 text-xs leading-4 text-slate-500">{context}</p></div>
      <button type="button" onClick={onClose} aria-label={t("Close properties")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
    </div>
    <div className={`min-h-0 overflow-y-auto overscroll-contain ${compact ? "space-y-2.5 p-3 [&_input]:h-8 [&_select]:h-8 [&_button]:!min-h-8 [&_button]:!py-1" : "space-y-4 p-4"}`}>{children}</div>
  </div>, document.body);
});

export function PropertyNumberField({ label, value, onCommit, min, max, unit, integer = false, onStep, inlineStepper = false }: {
  label: string; value: string; onCommit: (value: string) => void; min?: number; max?: number; unit?: string; integer?: boolean; onStep?: (delta: number, value: string) => void; inlineStepper?: boolean;
}) {
  const { t } = useLocale();
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => setDraft(value), [value]);
  return <label className="block min-w-0 text-xs font-medium text-slate-600">
    {label}
    <div className="relative mt-1.5 flex gap-1">
      <input type="number" min={min} max={max} step={integer ? 1 : "any"} inputMode={integer ? "numeric" : "decimal"} value={draft}
        className={`${controlClass} ${unit ? "pr-20" : ""}`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { if (!cancelled.current && draft !== value) onCommit(draft); cancelled.current = false; }}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
          if (event.key === "Escape") { event.preventDefault(); cancelled.current = true; setDraft(value); event.currentTarget.blur(); }
        }}
      />
      {unit ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-normal text-slate-400">{unit}</span> : null}
      {onStep ? <div className={inlineStepper ? "flex shrink-0 gap-1" : "flex w-7 shrink-0 flex-col gap-0.5"}>{(inlineStepper ? [-1, 1] : [1, -1]).map((delta) => <button key={delta} type="button" aria-label={delta > 0 ? t("Increase fret") : t("Decrease fret")}
        className={`flex flex-1 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${inlineStepper ? "h-9 w-9 text-base" : "text-[10px]"}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { const current = Number(draft); const base = Number.isFinite(current) ? current : Number(value); setDraft(String(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, base + delta)))); onStep(delta, draft); }}
      >{inlineStepper ? delta > 0 ? "+" : "−" : delta > 0 ? "↑" : "↓"}</button>)}</div> : null}
    </div>
  </label>;
}

export function DurationField({ value, min, max, onCommit, label }: { value: string; min: number; max: number; onCommit: (value: string) => void; label?: string }) {
  const { t } = useLocale();
  return <PropertyNumberField label={label ?? t("Precise duration")} value={value} min={min} max={max} onCommit={onCommit} unit={t("seconds")} />;
}

export function MusicalDurationField({ value, options, onChange, label }: { value: number; options: Array<{ value: number; label: string }>; onChange: (value: string) => void; label?: string }) {
  const { t } = useLocale();
  return <label className="block min-w-0 text-xs font-medium text-slate-600">{label ?? t("Duration")}
    <select className={`${controlClass} mt-1.5`} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

export function FingeringOption({ selected, onClick, children, blocked = false }: { selected: boolean; onClick: () => void; children: ReactNode; blocked?: boolean }) {
  const { t } = useLocale();
  return <button type="button" aria-pressed={selected} onClick={onClick} title={blocked ? t("Overlaps another note") : undefined}
    className={`${actionClass} ${selected ? "border-slate-500 bg-slate-50 ring-1 ring-inset ring-slate-400" : ""}`}>
    <span className="min-w-0 flex-1 text-left">{children}</span>
    {selected ? <span className="shrink-0 text-slate-700"><InspectorIcon kind="check" /></span> : null}
    {blocked ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" aria-label={t("Overlaps another note")} /> : null}
  </button>;
}

export function NoteFingerings({ tabs, blockedTabs, orderedTabs, current, labels, onSelect }: { tabs: TabCoord[]; blockedTabs: TabCoord[]; orderedTabs?: TabCoord[]; current: TabCoord; labels: string[]; onSelect: (tab: TabCoord) => void }) {
  const { t } = useLocale();
  // Selection only changes the highlight, never the playing-coordinate ranking.
  const all = [...(orderedTabs ?? [...tabs, ...blockedTabs]), current].filter((tab, index, list) => list.findIndex((other) => sameInspectorFingering([tab], [other])) === index);
  return <section aria-label={t("Alternative fingerings")}><h3 className="mb-2 text-xs font-medium text-slate-600">{t("Alternative fingerings")}</h3><div className="flex flex-wrap gap-1.5">
    {all.map((tab) => <FingeringOption key={`${tab[0]}-${tab[1]}`} selected={sameInspectorFingering([tab], [current])} blocked={blockedTabs.some((blocked) => sameInspectorFingering([blocked], [tab]))} onClick={() => onSelect(tab)}>{labels[tab[0]]}{tab[1]}</FingeringOption>)}
  </div></section>;
}

export function ChordFingerings({ tabs, alternatives, labels, onSelect, onEdit }: { tabs: TabCoord[]; alternatives: TabCoord[][]; labels: string[]; onSelect: (tabs: TabCoord[]) => void; onEdit: (event: React.MouseEvent<HTMLButtonElement>) => void }) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  return <>
    <section><div className="mb-1.5 flex items-center justify-between gap-2"><h3 className="text-xs font-medium text-slate-600">{t("Alternative fingerings")} <span className="text-slate-400">{alternatives.length}</span></h3><button type="button" className={`${actionClass} shrink-0 !px-2 !text-[11px]`} onClick={onEdit}>{t("Edit fingering")}</button></div>
      {alternatives.length ? <div className="max-h-48 space-y-1 overflow-y-auto overscroll-contain pr-1">
        {(expanded ? alternatives : alternatives.slice(0, 4)).map((option, index) => <div key={index} className="[&>button]:w-full"><FingeringOption selected={sameInspectorFingering(tabs, option)} onClick={() => onSelect(option)}>{option.map((tab) => `${labels[tab[0]]}${tab[1]}`).join(" · ")}</FingeringOption></div>)}
      </div> : <p className="text-xs text-slate-500">{t("No alternative fingerings")}</p>}
      {alternatives.length > 4 ? <button type="button" aria-expanded={expanded} className="mt-2 rounded text-xs font-medium text-slate-600 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400" onClick={() => setExpanded((prev) => !prev)}>{expanded ? t("Show fewer") : t("Show all")}</button> : null}
    </section>
  </>;
}

export function InspectorAction({ children, onClick, title }: { children: ReactNode; onClick: () => void; title?: string }) {
  return <button type="button" className={actionClass} onClick={onClick} title={title}>{children}</button>;
}

export function InspectorDelete({ label, onClick, title, inline = false }: { label: string; onClick: () => void; title?: string; inline?: boolean }) {
  return <div className={inline ? "" : "border-t border-slate-100 pt-3"}><button type="button" onClick={onClick} title={title} className="inline-flex min-h-9 items-center gap-2 rounded-md px-2 text-xs font-medium text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"><InspectorIcon kind="trash" />{label}</button></div>;
}
