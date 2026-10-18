import { useLocale } from "../lib/i18n/react";

const VALUES = [
  [1, "Whole note", "7"], [2, "Half note", "6"], [4, "Quarter note", "5"],
  [8, "Eighth note", "4"], [16, "Sixteenth note", "3"], [32, "Thirty-second note", "2"], [64, "Sixty-fourth note", "1"],
] as const;

function NoteValueIcon({ denominator }: { denominator: number }) {
  const hollow = denominator <= 2;
  return <svg viewBox="0 0 24 28" className="h-6 w-5" aria-hidden="true">
    <ellipse cx={9} cy={21} rx={5} ry={3.3} transform="rotate(-20 9 21)" fill={hollow ? "none" : "currentColor"} stroke="currentColor" strokeWidth={1.4} />
    {denominator > 1 && <path d="M13.5 21V3" fill="none" stroke="currentColor" strokeWidth={1.4} />}
    {Array.from({ length: Math.max(0, Math.log2(denominator) - 2) }, (_, index) =>
      <path key={index} d={`M13.5 ${3 + index * 4}q9 4 4 12q1-6-4-8`} fill="currentColor" />)}
  </svg>;
}

export default function GteNotationToolbar({ input, denominator, dotted, accidental, disabled, guides = false, onGuides, onInput, onDuration, onDot, onRest, onAccidental }: {
  input: boolean; denominator: number; dotted: boolean; accidental: -1 | 0 | 1 | null; disabled: boolean;
  onInput: (input: boolean) => void; onDuration: (denominator: number) => void; onDot: () => void;
  onRest: () => void; onAccidental: (accidental: -1 | 0 | 1) => void;
  guides?: boolean; onGuides?: () => void;
}) {
  const { t } = useLocale();
  const style = (active = false) => `flex h-11 min-w-8 flex-col items-center justify-center gap-0.5 rounded-md px-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-35 ${active ? "bg-emerald-100 text-emerald-900" : "text-slate-600 hover:bg-black/5"}`;
  const divider = <span className="mx-1 h-7 w-px bg-slate-300/60" aria-hidden="true" />;
  return <div role="toolbar" aria-label={t("Note input")} className="flex flex-wrap items-center gap-0.5" data-gte-floating-ui="true">
    <button type="button" aria-label={t("Select")} title={t("Select · Esc")} aria-pressed={!input} disabled={disabled} className={style(!input)} onClick={() => onInput(false)}>
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" aria-hidden="true"><path d="m5 3 14 10-7 1-3 7z" strokeWidth={1.5} strokeLinejoin="round" /></svg>
      <span className="text-[9px] leading-none">Esc</span>
    </button>
    <button type="button" aria-label={t("Note input")} title={t("Add notes · N")} aria-pressed={input} disabled={disabled} className={style(input) + " !flex-row !gap-2 !px-3"} onClick={() => onInput(!input)}>
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" aria-hidden="true"><path d="m4 16 11-11 4 4L8 20l-5 1zM13 7l4 4" strokeWidth={1.5} strokeLinejoin="round" /></svg>
      <span className="text-xs font-medium">{t("Add notes")}</span><span className="text-[9px] text-slate-400">N</span>
    </button>
    {divider}
    {VALUES.map(([value, name, shortcut]) => <button key={value} type="button" aria-label={t(name)} title={t(name) + " · " + shortcut}
      aria-pressed={denominator === value} disabled={disabled} className={style() + (denominator === value ? " !bg-white !text-slate-950 ring-1 ring-slate-300" : "")} onClick={() => onDuration(value)}>
      <NoteValueIcon denominator={value} /><span className="text-[9px] leading-none">{shortcut}</span>
    </button>)}
    {divider}
    <button type="button" aria-label={t("Dotted note")} title={t("Dotted note · .")} aria-pressed={dotted} disabled={disabled} className={style(dotted)} onClick={onDot}>
      <span className="flex h-6 items-center text-2xl leading-none">·</span><span className="text-[9px] leading-none">.</span>
    </button>
    <button type="button" aria-label={t("Rest")} title={t("Rest · 0")} disabled={disabled} className={style()} onClick={onRest}>
      <svg viewBox="0 0 20 28" className="h-6 w-5 fill-current" aria-hidden="true"><path d="m9 2 6 8-7 6 7 5q-9-4-6 5q-9-8 2-10l-7-6 7-5z" /></svg>
      <span className="text-[9px] leading-none">0</span>
    </button>
    {divider}
    {([[-1, "♭", "Flat"], [0, "♮", "Natural"], [1, "♯", "Sharp"]] as const).map(([value, glyph, label]) =>
      <button key={value} type="button" aria-label={t(label)} title={t(label)} aria-pressed={accidental === value} disabled={disabled}
        className={style(accidental === value)} onClick={() => onAccidental(value)}><span className="text-2xl leading-none">{glyph}</span></button>)}
    {onGuides && <>{divider}<button type="button" aria-label={t("Beat guides")} title={t("Beat guides")} aria-pressed={guides} disabled={disabled} className={style(guides)} onClick={onGuides}>
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" aria-hidden="true"><path d="M4 5v14M12 5v14M20 5v14" strokeDasharray="2 3" strokeWidth={1.5} /><path d="M3 19h18" strokeWidth={1.3} /></svg>
    </button></>}
  </div>;
}
