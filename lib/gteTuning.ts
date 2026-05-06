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
  { id: "dadgad", label: "DADGAD", openStringMidi: [62, 57, 55, 50, 45, 38] },
  { id: "open-g", label: "Open G", openStringMidi: [62, 59, 55, 50, 43, 38] },
];
const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
const DEFAULT_TUNING_ID = "standard";
export const TUNING_STRING_LABELS: Record<string, string[]> = {
  standard: ["E", "B", "G", "D", "A", "E"],
  "drop-d": ["E", "B", "G", "D", "A", "D"],
  "half-step-down": ["Eb", "Bb", "Gb", "Db", "Ab", "Eb"],
  dadgad: ["D", "A", "G", "D", "A", "D"],
  "open-g": ["D", "B", "G", "D", "G", "D"],
};

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

export const getOpenStringMidiFromSnapshot = (
  snapshot: Pick<EditorSnapshot, "tabRef" | "tuning">
) => {
  const preset = getTuningPreset(snapshot.tuning?.presetId);
  const capo = normalizeCapo(snapshot.tuning?.capo);
  if (preset?.openStringMidi?.length >= 6) {
    return preset.openStringMidi.slice(0, 6).map((value) => Math.round(Number(value)) + capo);
  }

  if (
    Array.isArray(snapshot.tuning?.openStringMidi) &&
    snapshot.tuning.openStringMidi.length >= 6 &&
    snapshot.tuning.openStringMidi.every((value) => Number.isFinite(Number(value)))
  ) {
    const fallbackCapo = normalizeCapo(snapshot.tuning?.capo);
    return snapshot.tuning.openStringMidi
      .slice(0, 6)
      .map((value) => Math.round(Number(value)) + fallbackCapo);
  }
  if (Array.isArray(snapshot.tabRef) && snapshot.tabRef.length >= 6) {
    const fromTabRef = snapshot.tabRef
      .slice(0, 6)
      .map((stringValues) =>
        Array.isArray(stringValues) && Number.isFinite(Number(stringValues[0]))
          ? Math.round(Number(stringValues[0]))
          : null
      );
    if (fromTabRef.every((value) => value !== null)) {
      return fromTabRef as number[];
    }
  }
  return [...TUNING_PRESETS[0].openStringMidi];
};

export const getStringLabelFromMidi = (midi: number) => {
  const safe = Math.round(Number(midi));
  if (!Number.isFinite(safe)) return "?";
  const index = ((safe % 12) + 12) % 12;
  return NOTE_NAMES[index];
};

export const getStringLabelsForSnapshot = (snapshot: Pick<EditorSnapshot, "tabRef" | "tuning">) => {
  const presetId = snapshot.tuning?.presetId || DEFAULT_TUNING_ID;
  const baseLabels = TUNING_STRING_LABELS[presetId];
  if (Array.isArray(baseLabels) && baseLabels.length === 6) {
    // Labels are anchored to the selected tuning preset and are intentionally
    // not transposed from previous state/capo display to avoid cumulative drift.
    return [...baseLabels];
  }
  return getOpenStringMidiFromSnapshot(snapshot).map((midi) => getStringLabelFromMidi(midi));
};
