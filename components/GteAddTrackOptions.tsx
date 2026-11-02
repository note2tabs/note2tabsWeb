import { useLocale } from "../lib/i18n/react";
import GteTrackInstrumentIcon from "./GteTrackInstrumentIcon";

type TrackKind = "tab" | "bass" | "piano" | "strings" | "instrument" | "drums" | "chords";
const groups: Array<{ label: string; options: Array<{ kind: TrackKind; label: string }> }> = [
  { label: "Tabs", options: [{ kind: "tab", label: "Guitar" }, { kind: "bass", label: "Bass" }] },
  { label: "Notation", options: [{ kind: "piano", label: "Piano" }, { kind: "strings", label: "Strings" }, { kind: "instrument", label: "Other instrument" }] },
  { label: "Drums", options: [{ kind: "drums", label: "Drums" }] },
  { label: "Chords", options: [{ kind: "chords", label: "Chords" }] },
];

function TrackIcon({ kind }: { kind: TrackKind }) {
  if (kind === "chords") return <svg viewBox="0 0 24 28" className="h-7 w-6 shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth="0.8" aria-hidden="true" data-chord-diagram="E-major">
    <path d="M3 8h18" strokeWidth="1.8" />
    <path d="M3 13h18M3 18h18M3 23h18M3 8v18M6.6 8v18M10.2 8v18M13.8 8v18M17.4 8v18M21 8v18" />
    <g strokeWidth="1.1"><circle cx="3" cy="3" r="1.3" /><circle cx="17.4" cy="3" r="1.3" /><circle cx="21" cy="3" r="1.3" /></g>
    <g fill="currentColor" stroke="none"><circle cx="6.6" cy="15.5" r="1.65" /><circle cx="10.2" cy="15.5" r="1.65" /><circle cx="13.8" cy="10.5" r="1.65" /></g>
  </svg>;
  return <GteTrackInstrumentIcon lane={{ trackType: kind === "drums" ? "drums" : kind === "bass" ? "bass" : "tab", instrumentId: kind === "tab" ? "guitar" : `gm:${kind}` }} className="h-5 w-5 text-slate-500" />;
}

export default function GteAddTrackOptions({ onSelect, disabled, mobile = false }: {
  onSelect: (kind: TrackKind) => void; disabled: boolean; mobile?: boolean;
}) {
  const { t } = useLocale();
  return <>{groups.map(group => <div key={group.label} role="group" aria-label={t(group.label)} className="border-b border-slate-100 pb-1 last:border-b-0 last:pb-0">
    <div aria-hidden="true" className="px-3 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">{t(group.label)}</div>
    {group.options.map(option => <button key={option.kind} type="button" role="menuitem" disabled={disabled} onClick={() => onSelect(option.kind)}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 text-left font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 ${mobile ? "min-h-11 text-sm" : "min-h-8 text-xs"}`}>
      <span className="flex w-6 shrink-0 items-center justify-center"><TrackIcon kind={option.kind} /></span>
      <span>{t(option.label)}</span>
    </button>)}
  </div>)}</>;
}
