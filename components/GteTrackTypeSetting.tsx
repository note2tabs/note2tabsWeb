import type { EditorSnapshot } from "../types/gte";
import { getTrackInstrumentType, type InstrumentType } from "../lib/gteInstrumentType";
import Note2TabsSelect from "./Note2TabsSelect";

export default function GteTrackTypeSetting({ track, onChange, t, issue }: { track: EditorSnapshot; onChange: (type: InstrumentType) => void; t: (key: string) => string; issue?: string }) {
  const type = getTrackInstrumentType(track);
  const chordTrack = (track.editorType ?? track.trackType) === "chords";
  return <><label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t("Instrument type")}
    <Note2TabsSelect<InstrumentType> value={type} disabled={type === "drums" || chordTrack} onChange={onChange} label="Instrument type" portal className="gte-track-select"
      options={type === "drums" ? [{ value: "drums", label: "Drums" }] : [{ value: "notation", label: "Notation" }, { value: "guitar-tab", label: "Guitar tab", disabled: type === "bass-tab" }, { value: "bass-tab", label: "Bass tab" }]} />
  </label>{type === "drums" && <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t("Instrument sound")}<Note2TabsSelect value="drum1" options={[{ value: "drum1", label: "Drum kit" }]} onChange={() => {}} label="Instrument sound" disabled className="gte-track-select" /></label>}
    {issue && <p role="alert" className="col-span-2 text-xs leading-relaxed text-slate-600">{t(issue)}</p>}
  </>;
}
