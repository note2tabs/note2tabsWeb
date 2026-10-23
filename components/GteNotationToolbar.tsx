import VexFlow from "vexflow/bravura";
import { useLocale } from "../lib/i18n/react";

const { Glyphs } = VexFlow;
const VALUES = [1, 2, 4, 8, 16, 32, 64];
const NAMES = ["Whole", "Half", "Quarter", "Eighth", "Sixteenth", "Thirty-second", "Sixty-fourth"];
const NOTES = [Glyphs.noteWhole, Glyphs.noteHalfUp, Glyphs.noteQuarterUp, Glyphs.note8thUp, Glyphs.note16thUp, Glyphs.note32ndUp, Glyphs.note64thUp];
const RESTS = [Glyphs.restWhole, Glyphs.restHalf, Glyphs.restQuarter, Glyphs.rest8th, Glyphs.rest16th, Glyphs.rest32nd, Glyphs.rest64th];
export function NotationValueSymbol({ index, rest = false }: { index: number; rest?: boolean }) {
  return <svg viewBox="0 0 40 64" className="h-6 w-5 shrink-0 [@media(max-height:700px)]:h-5" aria-hidden="true"><text x={9} y={rest ? 32 : index === 0 ? 33 : 54} fontFamily="Bravura" fontSize={40} fill="currentColor">{(rest ? RESTS : NOTES)[index]}</text></svg>;
}
type Props = {
  mode: "select" | "note" | "rest"; denominator: number; dotted: boolean; accidental: -1 | 0 | 1 | null; disabled: boolean;
  voice: 1 | 2; tieActive: boolean; slurActive: boolean; canTie: boolean; canSlur: boolean;
  onDuration: (value: number, rest: boolean) => void; onDot: () => void; onAccidental: (value: -1 | 0 | 1) => void;
  onVoice: (voice: 1 | 2) => void; onTie: () => void; onSlur: () => void; onDelete: () => void;
  onUndo?: () => void; onRedo?: () => void; undoCount?: number; redoCount?: number;
};
export default function GteNotationToolbar(p: Props) {
  const { t } = useLocale();
  const style = (active = false) => `flex min-h-7 min-w-0 flex-col items-center justify-center rounded-md px-1 py-0.5 text-slate-700 transition-colors hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-35 ${active ? "bg-emerald-100 text-emerald-900 ring-1 ring-inset ring-emerald-600/30" : ""}`;
  const group = "grid grid-cols-2 gap-0.5 border-t border-slate-200/70 pt-1";
  return <div role="toolbar" aria-label={t("Notation tools")} aria-orientation="vertical" className="grid w-[100px] gap-1 [@media(max-height:700px)]:w-[124px]" data-gte-floating-ui="true">
    {(p.onUndo || p.onRedo) && <div role="group" aria-label={t("History")} className="grid grid-cols-2 gap-0.5">
      {([false, true] as const).map(redo => <button key={String(redo)} type="button" aria-label={t(redo ? "Redo" : "Undo")} title={t(redo ? "Redo · Ctrl+Shift+Z" : "Undo · Ctrl+Z")} className={style()} disabled={p.disabled || !(redo ? p.onRedo : p.onUndo) || (redo ? p.redoCount : p.undoCount) === 0} onClick={redo ? p.onRedo : p.onUndo}>
        <span aria-hidden="true" className="h-4 w-4 bg-current" style={{ maskImage: `url(/icons/${redo ? "redo" : "undo"}-transparent.png)`, WebkitMaskImage: `url(/icons/${redo ? "redo" : "undo"}-transparent.png)`, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }} />
      </button>)}
    </div>}
    {([false, true] as const).map((rest) => <div key={String(rest)} role="group" aria-label={t(rest ? "Rest durations" : "Note durations")} className={group + " [@media(max-height:700px)]:grid-cols-3"}>
      {VALUES.map((value, index) => <button key={value} type="button" className={style(p.mode === (rest ? "rest" : "note") && p.denominator === value)}
        aria-label={t(NAMES[index] + (rest ? " rest" : " note"))} title={t(NAMES[index] + (rest ? " rest" : " note"))}
        aria-pressed={p.mode === (rest ? "rest" : "note") && p.denominator === value} disabled={p.disabled} onClick={() => p.onDuration(value, rest)}>
        <NotationValueSymbol index={index} rest={rest} /><span className="text-[9px] leading-none">{value === 1 ? "1" : `1/${value}`}</span>
      </button>)}
    </div>)}
    <div role="group" aria-label={t("Dots and accidentals")} className={group}>
      <button type="button" className={style(p.dotted)} aria-label={t("Dotted note")} title={t("Dotted duration")} aria-pressed={p.dotted} onClick={p.onDot} disabled={p.disabled}><span className="text-xl leading-none">·</span></button>
      {([[-1, "♭", "Flat"], [0, "♮", "Natural"], [1, "♯", "Sharp"]] as const).map(([value, symbol, name]) => <button key={value} type="button" className={style(p.accidental === value)} aria-label={t(name)} title={t(name + " · chromatic override")} aria-pressed={p.accidental === value} disabled={p.disabled} onClick={() => p.onAccidental(value)}><span className="text-2xl leading-none">{symbol}</span></button>)}
    </div>
    <div role="group" aria-label={t("Voice")} className={group}>
      {([1, 2] as const).map((value) => <button key={value} type="button" className={style(p.voice === value)} aria-label={t("Voice") + " " + value} title={t("Voice") + " " + value} aria-pressed={p.voice === value} disabled={p.disabled} onClick={() => p.onVoice(value)}><span className="text-[10px]">{t("Voice")} {value}</span></button>)}
    </div>
    <div role="group" aria-label={t("Ties and slurs")} className={group}>
      {([false, true] as const).map((slur) => <button key={String(slur)} type="button" className={style(slur ? p.slurActive : p.tieActive)} aria-label={t(slur ? "Slur" : "Tie")} title={t(slur ? "Slur · select phrase endpoints" : "Tie · select consecutive notes of the same pitch")} aria-pressed={slur ? p.slurActive : p.tieActive} disabled={p.disabled || !(slur ? p.canSlur : p.canTie)} onClick={slur ? p.onSlur : p.onTie}>
        <svg viewBox="0 0 36 24" className="h-5 w-8 fill-none stroke-current" aria-hidden="true"><ellipse cx="7" cy={slur ? 15 : 11} rx="3" ry="2" fill="currentColor" /><ellipse cx="29" cy={slur ? 6 : 11} rx="3" ry="2" fill="currentColor" /><path d={slur ? "M6 10Q13 -2 29 1" : "M8 16Q18 24 28 16"} strokeWidth="1.4" /></svg>
        <span className="text-[9px]">{t(slur ? "Slur" : "Tie")}</span>
      </button>)}
    </div>
    <button type="button" className={style()} aria-label={t("Delete")} title={t("Delete · Delete / Backspace")} disabled={p.disabled} onClick={p.onDelete}><span className="text-[10px]">{t("Delete")}</span></button>
  </div>;
}
