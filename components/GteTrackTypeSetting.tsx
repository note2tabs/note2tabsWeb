import type { EditorSnapshot } from "../types/gte";
import { getTrackInstrumentType, type InstrumentType } from "../lib/gteInstrumentType";

export default function GteTrackTypeSetting({ track, onChange, t, issue }: { track: EditorSnapshot; onChange: (type: InstrumentType) => void; t: (key: string) => string; issue?: string }) {
  const type = getTrackInstrumentType(track);
  const chordTrack = (track.editorType ?? track.trackType) === "chords";
  return <><label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t("Instrument type")}
    <select value={type} disabled={type === "drums" || chordTrack} onChange={event => onChange(event.target.value as InstrumentType)}
      className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 disabled:opacity-60">
      {type === "drums" ? <option value="drums">{t("Drums")}</option> : <>
        <option value="notation">{t("Notation")}</option>
        <option value="guitar-tab" disabled={type === "bass-tab"}>{t("Guitar tab")}</option>
        <option value="bass-tab">{t("Bass tab")}</option>
      </>}
    </select>
  </label>{type === "drums" && <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t("Instrument sound")}<select disabled className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 disabled:opacity-60"><option>{t("Drum kit")}</option></select></label>}
    {issue && <p role="alert" className="col-span-2 text-xs leading-relaxed text-slate-600">{t(issue)}</p>}
  </>;
}
