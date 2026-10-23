import type { EditorSnapshot, TabCoord } from "../types/gte";
import { defaultInstrumentSound, getTrackInstrumentType, type InstrumentType } from "./gteInstrumentType";
import { scoreEvents } from "./gteNotation";
import { getAllTabsForMidi } from "./gteTuning";

/** Conversion never transposes, trims, or discards musical events. */
export function convertTrackInstrument(track: EditorSnapshot, target: InstrumentType): { snapshot?: EditorSnapshot; issue?: string } {
  const source = getTrackInstrumentType(track);
  if (source === target) return { snapshot: track };
  if (source === "drums" || target === "drums") return { issue: "Drum tracks cannot be converted to or from pitched instruments." };
  if (source === "bass-tab" && target === "guitar-tab") return { issue: "Bass tablature cannot be switched directly to guitar tablature." };
  const kind = target === "bass-tab" ? "bass" : "tab";
  const next: EditorSnapshot = { ...track, instrumentType: target, editorType: kind, type: kind, trackType: kind,
    instrumentId: defaultInstrumentSound(target),
    chordEditor: { ...track.chordEditor, instrumentType: target, instrumentSound: defaultInstrumentSound(target) } };
  if (target === "notation") return { snapshot: { ...next, notation: track.notation ?? {} } };
  next.tuning = target === "bass-tab"
    ? { presetId: "bass-standard", label: "Standard", openStringMidi: [43, 38, 33, 28], capo: 0 }
    : { presetId: "standard", label: "Standard", openStringMidi: [64, 59, 55, 50, 45, 40], capo: 0 };
  next.maxFret = 22;
  const events = scoreEvents(track).sort((a, b) => a.start - b.start || a.midi - b.midi);
  const count = track.notes.length + track.chords.reduce((sum, chord) => sum + Math.max(chord.originalMidi.length, chord.currentTabs.length), 0);
  if (events.length !== count || events.some(event => !Number.isFinite(event.start) || event.start < 0)) return { issue: "Some notes have invalid pitches or timing. Conversion cancelled to preserve the track." };
  const candidates = new Map(events.map(event => [event.key, getAllTabsForMidi(next, event.midi).sort((a,b) => a[1]-b[1])]));
  const outside = events.filter(event => !candidates.get(event.key)!.length).length;
  if (outside) return { issue: `${outside} notes are outside the ${target === "bass-tab" ? "bass" : "guitar"} tablature range. Conversion cancelled to preserve every note. Change their pitches or keep notation.` };
  const conflicts = new Map<string, string[]>();
  let active: typeof events = [];
  for (const event of events) {
    active = active.filter(other => other.start + other.length > event.start + 1e-7);
    if (active.length >= next.tuning.openStringMidi.length) return { issue: "There are more overlapping notes than available strings. Conversion cancelled; all notes are unchanged." };
    conflicts.set(event.key, active.map(other => other.key));
    active.push(event);
  }
  const assigned = new Map<string, TabCoord>();
  // Solve each overlapping component independently, with a bounded search for
  // pathological imports. A failed search leaves the original track untouched.
  for (let first = 0; first < events.length;) {
    let end = first + 1, until = events[first].start + events[first].length;
    while (end < events.length && events[end].start < until - 1e-7) { until = Math.max(until, events[end].start + events[end].length); end++; }
    let budget = 100000;
    const choices = new Map<number, number>();
    let index = first;
    while (index >= first && index < end && --budget >= 0) {
      const event = events[index];
      const options = candidates.get(event.key)!;
      let found = false;
      for (let choice = choices.get(index) ?? 0; choice < options.length; choice++) {
        choices.set(index, choice + 1);
        const tab = options[choice];
        let blocked = false;
        for (const previous of conflicts.get(event.key)!) if (assigned.get(previous)?.[0] === tab[0]) { blocked = true; break; }
        if (blocked) continue;
        assigned.set(event.key, tab);
        found = true;
        index++;
        break;
      }
      if (!found) {
        assigned.delete(event.key);
        choices.delete(index);
        index--;
      }
    }
    if (index !== end) return { issue: budget < 0 ? "This passage is too complex to assign to strings safely. Conversion cancelled; keep notation or simplify the passage first." : "Some overlapping notes cannot be assigned to separate strings in this tablature format. Conversion cancelled; all notes are unchanged. Reduce the overlapping voices or keep notation." };
    first = end;
  }
  next.notes = track.notes.map(note => ({ ...note, tab: assigned.get(`n:${note.id}`)!, optimals: candidates.get(`n:${note.id}`)! }));
  next.chords = track.chords.map(chord => {
    const tabs = Array.from({ length: Math.max(chord.originalMidi.length, chord.currentTabs.length) }, (_, index) => assigned.get(`c:${chord.id}:${index}`)!);
    return { ...chord, currentTabs: tabs, ogTabs: tabs, fingering: undefined, fingeringIndex: undefined };
  });
  if (target === "bass-tab") {
    let id = track.chords.reduce((max, chord) => Math.max(max, chord.id), track.notes.reduce((max, note) => Math.max(max, note.id), 0)) + 1;
    const keys = new Map<string, string>();
    for (const event of events) {
      if (event.chordId === undefined) continue;
      const noteId = id++;
      keys.set(event.key, `n:${noteId}`);
      next.notes.push({ id: noteId, startTime: event.start, length: event.length, midiNum: event.midi,
        tab: assigned.get(event.key)!, optimals: candidates.get(event.key)!, velocity: event.velocity,
        pitchBend: event.pitchBend, notationVoice: event.voice, notationStaff: event.staff });
    }
    next.chords = [];
    if (next.notation) next.notation = { ...next.notation,
      ties: next.notation.ties?.map(pair => ({ from: keys.get(pair.from) ?? pair.from, to: keys.get(pair.to) ?? pair.to })),
      slurs: next.notation.slurs?.map(pair => ({ from: keys.get(pair.from) ?? pair.from, to: keys.get(pair.to) ?? pair.to })) };
  }
  return { snapshot: next };
}
