import type { EditorSnapshot } from "../types/gte";

export type TuningPreset = {
  id: string;
  label: string;
  openStringMidi: number[];
};

export const MAX_CAPO = 12;
export const DEFAULT_MAX_FRET = 22;

export const TUNING_PRESETS: TuningPreset[] = [
  { id: "standard", label: "Standard", openStringMidi: [64, 59, 55, 50, 45, 40] },
  { id: "drop-d", label: "Drop D", openStringMidi: [64, 59, 55, 50, 45, 38] },
  { id: "half-step-down", label: "Eb standard", openStringMidi: [63, 58, 54, 49, 44, 39] },
  { id: "dadgad", label: "DADGAD", openStringMidi: [62, 57, 54, 50, 45, 38] },
  { id: "open-g", label: "Open G", openStringMidi: [62, 59, 55, 50, 43, 38] },
];

export const getTuningPreset = (presetId: string | undefined) =>
  TUNING_PRESETS.find((preset) => preset.id === presetId) || TUNING_PRESETS[0];

export const normalizeCapo = (value: unknown) => {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(MAX_CAPO, parsed));
};

export const buildTabRefForTuning = (
  openStringMidi: number[],
  capo: number,
  maxFret: number = DEFAULT_MAX_FRET
) => {
  const safeCapo = normalizeCapo(capo);
  const safeMaxFret = Math.max(1, Math.round(maxFret));
  return openStringMidi.map((openMidi) =>
    Array.from({ length: safeMaxFret + 1 }, (_, fret) => Math.round(openMidi) + safeCapo + fret)
  );
};

export const getMaxFretFromSnapshot = (snapshot: Pick<EditorSnapshot, "tabRef">) =>
  snapshot.tabRef?.[0]?.length ? Math.max(1, snapshot.tabRef[0].length - 1) : DEFAULT_MAX_FRET;

export const applyTuningToSnapshot = (
  snapshot: EditorSnapshot,
  presetId: string,
  capoValue: number
): EditorSnapshot => {
  const preset = getTuningPreset(presetId);
  const capo = normalizeCapo(capoValue);
  const maxFret = getMaxFretFromSnapshot(snapshot);
  const tabRef = buildTabRefForTuning(preset.openStringMidi, capo, maxFret);
  const next: EditorSnapshot = {
    ...snapshot,
    tuning: {
      presetId: preset.id,
      label: preset.label,
      openStringMidi: [...preset.openStringMidi],
      capo,
    },
    tabRef,
    notes: snapshot.notes.map((note) => ({
      ...note,
      midiNum: tabRef[note.tab[0]]?.[note.tab[1]] ?? note.midiNum,
    })),
    chords: snapshot.chords.map((chord) => ({
      ...chord,
      originalMidi: chord.currentTabs.map((tab, index) => tabRef[tab[0]]?.[tab[1]] ?? chord.originalMidi[index] ?? 0),
    })),
  };
  return next;
};

export const getSnapshotTuning = (snapshot: EditorSnapshot) => {
  const preset = getTuningPreset(snapshot.tuning?.presetId);
  return {
    presetId: preset.id,
    capo: normalizeCapo(snapshot.tuning?.capo),
  };
};
