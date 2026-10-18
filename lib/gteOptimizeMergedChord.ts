import type { EditorSnapshot } from "../types/gte";
import { cloneEditorSnapshot } from "./gteLocalEditorOps";
import { createBackendStyleChordAlternatives } from "./gteFingeringOptimization";
import { getTabMidi } from "./gteTuning";

/** Optimize just the newly merged chord; leave the rest of the track unchanged. */
export function optimizeMergedChord(snapshot: EditorSnapshot, chordId: number): EditorSnapshot {
  const next = cloneEditorSnapshot(snapshot);
  const chord = next.chords.find((item) => item.id === chordId);
  if (!chord) return next;
  const coord = next.cutPositionsWithCoords.find(([[start, end]]) => start <= chord.startTime && chord.startTime < end)?.[1] ?? [2, 0];
  const midis = chord.currentTabs.map((tab) => getTabMidi(next, tab));
  const best = createBackendStyleChordAlternatives(next, midis, coord, true)[0];
  if (best) {
    chord.currentTabs = best.map((tab) => [...tab]);
    chord.ogTabs = best.map((tab) => [...tab]);
    delete chord.fingering;
    chord.fingeringIndex = 0;
  }
  return next;
}
