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

const getTabMidi = (snapshot: Pick<EditorSnapshot, "tabRef">, tab: number[] | undefined, fallback = 0) => {
  if (!tab || tab.length < 2) return fallback;
  const midi = snapshot.tabRef?.[tab[0]]?.[tab[1]];
  return Number.isFinite(Number(midi)) ? Math.round(Number(midi)) : fallback;
};

const getAllTabsForMidi = (tabRef: number[][] | undefined, midi: number) => {
  const tabs: Array<[number, number]> = [];
  tabRef?.forEach((stringValues, stringIndex) => {
    stringValues?.forEach((value, fret) => {
      if (Number(value) === midi) tabs.push([stringIndex, fret]);
    });
  });
  return tabs;
};

const resolvePlayableMidi = (tabRef: number[][] | undefined, midi: number) => {
  const safeMidi = Math.round(Number(midi));
  if (!Number.isFinite(safeMidi)) return null;
  for (const candidate of [safeMidi, safeMidi + 12, safeMidi - 12]) {
    const tabs = getAllTabsForMidi(tabRef, candidate);
    if (tabs.length) return { midi: candidate, tabs };
  }
  return null;
};

const getCutCoordAtTime = (snapshot: Pick<EditorSnapshot, "cutPositionsWithCoords" | "totalFrames" | "tabRef">, time: number) => {
  const fallback: [number, number] = [2, 0];
  const totalFrames = Math.max(1, Math.round(Number(snapshot.totalFrames) || 1));
  const roundedTime = Math.max(0, Math.min(totalFrames, Math.round(Number(time) || 0)));
  const cuts = Array.isArray(snapshot.cutPositionsWithCoords) ? snapshot.cutPositionsWithCoords : [];
  const hit = cuts.find((entry) => roundedTime >= entry[0]?.[0] && roundedTime < entry[0]?.[1]);
  const tab = hit?.[1] ?? fallback;
  return [
    Math.max(0, Math.min(5, Math.round(Number(tab[0]) || 0))),
    Math.max(0, Math.min(getMaxFretFromSnapshot(snapshot), Math.round(Number(tab[1]) || 0))),
  ] as [number, number];
};

const eventOverlaps = (leftStart: number, leftLength: number, rightStart: number, rightLength: number) => {
  const leftEnd = Math.round(leftStart) + Math.max(1, Math.round(leftLength));
  const rightEnd = Math.round(rightStart) + Math.max(1, Math.round(rightLength));
  return Math.round(leftStart) < rightEnd && Math.round(rightStart) < leftEnd;
};

const chooseOptimizedTab = (
  tabs: Array<[number, number]>,
  reference: [number, number],
  blocked: Set<string>
) => {
  const ranked = tabs
    .map((tab) => ({
      tab,
      blocked: blocked.has(`${tab[0]}:${tab[1]}`),
      distance: Math.abs(tab[0] - reference[0]) + Math.abs(tab[1] - reference[1]),
    }))
    .sort((left, right) =>
      Number(left.blocked) - Number(right.blocked) ||
      left.distance - right.distance ||
      left.tab[0] - right.tab[0] ||
      left.tab[1] - right.tab[1]
    );
  return ranked[0]?.tab ?? null;
};

export const applyTuningToSnapshotPreservingSound = (
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
    notes: [],
    chords: [],
  };

  const occupiedAt = (startTime: number, length: number, exclude?: { noteId?: number; chordId?: number }) => {
    const blocked = new Set<string>();
    next.notes.forEach((note) => {
      if (exclude?.noteId === note.id) return;
      if (eventOverlaps(startTime, length, note.startTime, note.length)) blocked.add(`${note.tab[0]}:${note.tab[1]}`);
    });
    next.chords.forEach((chord) => {
      if (exclude?.chordId === chord.id) return;
      if (!eventOverlaps(startTime, length, chord.startTime, chord.length)) return;
      chord.currentTabs.forEach((tab) => blocked.add(`${tab[0]}:${tab[1]}`));
    });
    return blocked;
  };

  const notes = [...snapshot.notes].sort((left, right) => left.startTime - right.startTime || left.id - right.id);
  notes.forEach((note) => {
    const originalMidi = note.midiNum || getTabMidi(snapshot, note.tab);
    const resolved = resolvePlayableMidi(tabRef, originalMidi);
    if (!resolved) return;
    const reference = getCutCoordAtTime(next, note.startTime);
    const tab = chooseOptimizedTab(resolved.tabs, reference, occupiedAt(note.startTime, note.length, { noteId: note.id }));
    if (!tab) return;
    next.notes.push({
      ...note,
      midiNum: resolved.midi,
      tab: [tab[0], tab[1]],
      optimals: resolved.tabs.map((candidate) => [candidate[0], candidate[1]]),
    });
  });

  const chords = [...snapshot.chords].sort((left, right) => left.startTime - right.startTime || left.id - right.id);
  chords.forEach((chord) => {
    const tabs: Array<[number, number]> = [];
    const midis: number[] = [];
    const localBlocked = occupiedAt(chord.startTime, chord.length, { chordId: chord.id });
    chord.currentTabs.forEach((oldTab, index) => {
      const originalMidi = chord.originalMidi[index] || getTabMidi(snapshot, oldTab);
      const resolved = resolvePlayableMidi(tabRef, originalMidi);
      if (!resolved) return;
      const reference = tabs[tabs.length - 1] ?? getCutCoordAtTime(next, chord.startTime);
      const tab = chooseOptimizedTab(resolved.tabs, reference, localBlocked);
      if (!tab) return;
      localBlocked.add(`${tab[0]}:${tab[1]}`);
      tabs.push([tab[0], tab[1]]);
      midis.push(resolved.midi);
    });
    if (!tabs.length) return;
    next.chords.push({
      ...chord,
      originalMidi: midis,
      currentTabs: tabs,
      ogTabs: tabs.map((tab) => [tab[0], tab[1]]),
    });
  });

  const remainingNoteIds = new Set(next.notes.map((note) => note.id));
  next.noteEffects = (next.noteEffects || []).filter(
    (effect) => remainingNoteIds.has(effect.startNoteId) && remainingNoteIds.has(effect.endNoteId)
  );

  return next;
};

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
