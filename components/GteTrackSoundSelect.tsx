import Note2TabsSelect from "./Note2TabsSelect";
import { getTrackInstrumentOption, normalizeTrackInstrumentId, trackInstrumentFamily, TRACK_INSTRUMENT_FAMILIES, type TrackInstrumentOption } from "../lib/gteInstrumentManifest";
import { editorInstrumentName } from "../lib/i18n/editor/instruments";
import { useLocale } from "../lib/i18n/react";

export default function GteTrackSoundSelect({ value, options, onChange }: { value: string; options: TrackInstrumentOption[]; onChange: (value: string) => void }) {
  const { t } = useLocale();
  const soundId = normalizeTrackInstrumentId(value);
  const selectedSound = getTrackInstrumentOption(soundId);
  // Some saved tracks still use built-in presets. Never display the first
  // sampled option (Acoustic Guitar) while playing an entirely different sound.
  const soundOptions = options.some(option => option.id === soundId) ? options : [...options, selectedSound];
  const grouped = TRACK_INSTRUMENT_FAMILIES.flatMap(group => soundOptions.filter(option => trackInstrumentFamily(option) === group).map(option => ({ value: option.id, label: editorInstrumentName(option.label, t), group })));
  return <Note2TabsSelect value={soundId} options={grouped} onChange={onChange} label="Instrument sound" portal searchable className="gte-track-select" />;
}
