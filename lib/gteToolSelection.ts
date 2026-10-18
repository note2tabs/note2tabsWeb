import type { EditorSnapshot } from "../types/gte";
import { getMaxFretFromSnapshot, getOpenStringMidiFromSnapshot, getTabMidi } from "./gteTuning";
import { orderNotesForEffect } from "./gteNoteEffects";

export type PendingSelectionTool = "quantize" | "scale" | "move" | "hammer-pull" | "slide" | "bend" | "merge-chord" | "disband" | "snap-key" | "merge-notes" | "subdivide" | "transpose" | "optimize";
export const TOOLBAR_SELECTION_TOOLS: Record<string, PendingSelectionTool> = {
  "Merge to Chord": "merge-chord", "Disband Chord": "disband", "Snap to Key": "snap-key", "Snap to beat": "quantize",
  "Merge Notes": "merge-notes", Subdivide: "subdivide", Lengthen: "scale", Move: "move", Transpose: "transpose", "Hammer/Pull": "hammer-pull", Bend: "bend", Slide: "slide",
};
export const TOOL_SELECTION_LABELS: Record<PendingSelectionTool, string> = {
  optimize: "Optimize fingerings",
  "merge-chord": "Merge to chord", disband: "Disband chord", "snap-key": "Snap to key", quantize: "Snap to beat", "merge-notes": "Merge notes",
  subdivide: "Subdivide", scale: "Lengthen", move: "Move", transpose: "Transpose", "hammer-pull": "Hammer/Pull", bend: "Bend", slide: "Slide",
};
export function toolAllowsSelection(tool: PendingSelectionTool, kind: "note" | "chord") {
  if (tool === "disband") return kind === "chord";
  if (["merge-notes", "hammer-pull", "bend", "slide"].includes(tool)) return kind === "note";
  return true;
}
export function toolSelectionRule(tool: PendingSelectionTool, snapshot: EditorSnapshot, noteIds: number[], chordIds: number[]) {
  const noteSet = new Set(noteIds), chordSet = new Set(chordIds);
  const notes = snapshot.notes.filter((note) => noteSet.has(note.id)), chords = snapshot.chords.filter((chord) => chordSet.has(chord.id));
  const count = notes.length + chords.length;
  const result = (valid: boolean, hint: string) => ({ valid, hint });
  if (notes.length && !toolAllowsSelection(tool, "note")) return result(false, "Select chords only.");
  if (chords.length && !toolAllowsSelection(tool, "chord")) return result(false, "Select standalone notes only.");
  if (tool === "disband") return result(chords.length > 0, "Select one or more chords.");
  if (tool === "merge-chord") {
    const pitches = [...notes.map((note) => getTabMidi(snapshot, note.tab)), ...chords.flatMap((chord) => chord.currentTabs.map((tab) => getTabMidi(snapshot, tab)))];
    if (new Set(pitches.map((midi) => midi % 12)).size > getOpenStringMidiFromSnapshot(snapshot).length) return result(false, "The merged chord has too many pitches for this instrument.");
    return result(count >= 2, "Select at least two notes or chords.");
  }
  if (tool === "merge-notes") {
    const strings = new Set<number>();
    const pair = notes.some((note) => { const seen = strings.has(note.tab[0]); strings.add(note.tab[0]); return seen; });
    return result(pair, "Select at least two notes on the same string.");
  }
  if (["hammer-pull", "bend", "slide"].includes(tool)) {
    if (notes.length < 2) return result(false, "Select at least two standalone notes.");
    const ordered = orderNotesForEffect(snapshot, notes.map((note) => note.id));
    if (ordered.some((note, index) => index > 0 && note.startTime <= ordered[index - 1].startTime)) return result(false, "Select notes at different start times.");
    const base = getOpenStringMidiFromSnapshot(snapshot)[ordered[0].tab[0]], maxFret = getMaxFretFromSnapshot(snapshot);
    const compatible = ordered.every((note) => { const midi = Number.isFinite(note.midiNum) && note.midiNum > 0 ? note.midiNum : getTabMidi(snapshot, note.tab); const fret = midi - base; return Number.isInteger(fret) && fret >= 0 && fret <= maxFret; });
    const blocked = ordered.slice(0, -1).some((note, index) => {
      const end = Math.round(note.startTime + Math.max(1, Math.min(800, Math.round(note.length))));
      const nextStart = Math.round(ordered[index + 1].startTime);
      return snapshot.notes.some((other) => !noteSet.has(other.id) && other.tab[0] === ordered[0].tab[0] && end <= Math.round(other.startTime) && Math.round(other.startTime) <= nextStart);
    });
    if (blocked) return result(false, "Include intervening notes on the same string.");
    return result(compatible, compatible ? "Notes will use the first note's string." : "These pitches cannot all play on the first note's string.");
  }
  return result(count > 0, "Select one or more notes or chords.");
}
