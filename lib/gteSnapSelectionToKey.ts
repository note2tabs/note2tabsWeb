import type { EditorSnapshot, TabCoord } from "../types/gte";
import { cloneEditorSnapshot } from "./gteLocalEditorOps";
import { applyNoteFingeringUpdates, getEffectAwareFingeringUpdates } from "./gteNoteEffects";
import { getAllTabsForMidi, getTabMidi } from "./gteTuning";

/** Snap selected pitches, keeping chord identity/timing and unique strings. */
export function snapSelectionToKey(source: EditorSnapshot, noteIds: number[], chordIds: number[], snapTab: (snapshot: EditorSnapshot, tab: TabCoord) => TabCoord) {
  const snapshot = cloneEditorSnapshot(source);
  const notes = new Set(noteIds), chords = new Set(chordIds);
  const requested = snapshot.notes.filter((note) => notes.has(note.id)).flatMap((note) => {
    const tab = snapTab(source, note.tab);
    return tab[0] === note.tab[0] && tab[1] === note.tab[1] ? [] : [{ noteId: note.id, tab }];
  });
  const updates = getEffectAwareFingeringUpdates(source, requested);
  applyNoteFingeringUpdates(snapshot, updates);
  let changedChords = 0;
  for (const chord of snapshot.chords) {
    if (!chords.has(chord.id)) continue;
    const targets = chord.currentTabs.map((tab) => snapTab(source, tab));
    const midis = targets.map((tab) => getTabMidi(source, tab));
    if (chord.currentTabs.every((tab, index) => getTabMidi(source, tab) === midis[index])) continue;
    const candidates = midis.map((midi) => getAllTabsForMidi(source, midi));
    const chosen: TabCoord[] = [], used = new Set<number>();
    let best: TabCoord[] | null = null, bestScore = Infinity;
    const search = (index: number, score: number) => {
      if (score >= bestScore) return;
      if (index === candidates.length) { best = chosen.map((tab) => [...tab]); bestScore = score; return; }
      for (const tab of candidates[index]) {
        if (used.has(tab[0])) continue;
        used.add(tab[0]); chosen.push(tab);
        const original = chord.currentTabs[index];
        search(index + 1, score + Math.abs(tab[0] - original[0]) * 10 + Math.abs(tab[1] - original[1]));
        chosen.pop(); used.delete(tab[0]);
      }
    };
    search(0, 0);
    const bestTabs = best as TabCoord[] | null;
    if (!bestTabs) throw new Error("This chord cannot be snapped to key without string conflicts. Try another fingering.");
    chord.currentTabs = bestTabs;
    chord.ogTabs = bestTabs.map((tab) => [...tab]);
    chord.originalMidi = midis;
    delete chord.fingering;
    chord.fingeringIndex = 0;
    changedChords += 1;
  }
  return { snapshot, changed: updates.length > 0 || changedChords > 0, previewTab: requested[0]?.tab ?? snapshot.chords.find((chord) => chords.has(chord.id))?.currentTabs[0] };
}
