import Note2TabsSelect from "./Note2TabsSelect";
import type { TrackInstrumentOption } from "../lib/gteInstrumentManifest";
import { editorInstrumentName } from "../lib/i18n/editor/instruments";
import { useLocale } from "../lib/i18n/react";

export default function GteTrackSoundSelect({ value, options, onChange }: { value: string; options: TrackInstrumentOption[]; onChange: (value: string) => void }) {
  const { t } = useLocale();
  const family = (id: string) => id.includes("piano") ? "Piano" : id.includes("bass") ? "Bass" : id.includes("synth") ? "Synth" : "Guitar";
  const order = ["Guitar", "Bass", "Piano", "Synth"];
  const grouped = order.flatMap(group => options.filter(option => family(option.id) === group).map(option => ({ value: option.id, label: editorInstrumentName(option.label, t), group })));
  return <Note2TabsSelect value={value} options={grouped} onChange={onChange} label="Instrument sound" portal className="gte-track-select" />;
}
