import { describe, expect, it } from "vitest";
import { assignNoteVoices, generateVoiceCandidates, melodicContinuityCost, durationOverlapCost, type VoiceInputNote } from "../../lib/gteVoiceAssignment";
import { assignVoices } from "../../lib/gteAssignVoices";
import { restoreNotationSnapshot, serializeNotationSnapshot } from "../../lib/gteNotationPersistence";
import { setScoreVoice } from "../../lib/gteNotation";
import type { EditorSnapshot } from "../../types/gte";
const note = (id: string, pitch: number, onset: number, duration = 96): VoiceInputNote => ({ id, pitch, onset, duration });
const voices = (notes: VoiceInputNote[]) => Object.fromEntries(assignNoteVoices(notes).assignments.map(item => [item.noteId, item.voice]));
const track = (input: VoiceInputNote[]): EditorSnapshot => ({ id: "piano", instrumentType: "notation", instrumentId: "gm:piano", framesPerMessure: 384, fps: 192, totalFrames: 768,
  notes: input.map((note, i) => ({ id: i + 1, midiNum: note.pitch, startTime: note.onset, length: note.duration, tab: [0, 0], optimals: [] })), chords: [], cutPositionsWithCoords: [], optimalsByTime: {} });
describe("bounded global voice assignment", () => {
  it("A: leaves a monophonic melody in Voice 1", () => {
    expect(Object.values(voices([60, 62, 64, 65, 67].map((pitch, i) => note(String(i), pitch, i * 96))))).toEqual([1, 1, 1, 1, 1]);
  });
  it("B: leaves ordinary block chords together in Voice 1", () => {
    const input = [[60, 64, 67], [65, 69, 72], [67, 71, 74]].flatMap((pitches, i) => pitches.map(pitch => note(`${i}:${pitch}`, pitch, i * 96)));
    expect(Object.values(voices(input)).every(voice => voice === 1)).toBe(true);
  });
  it("C/E: separates sustained bass and moving upper chords", () => {
    const input = [note("bass", 48, 0, 384), ...[64, 65, 67, 69].map((pitch, i) => note("melody" + i, pitch, i * 96)), note("chord", 71, 0)];
    expect(voices(input)).toEqual({ bass: 2, chord: 1, melody0: 1, melody1: 1, melody2: 1, melody3: 1 });
  });
  it("D: keeps independent rhythmic lines consistent across bars", () => {
    const input = Array.from({ length: 12 }, (_, i) => note("u" + i, 72 + i % 4 * 2, i * 96));
    input.push(...Array.from({ length: 6 }, (_, i) => note("l" + i, i % 2 ? 55 : 48, i * 192, 192)));
    const assigned = voices(input);
    for (const item of input) expect(assigned[item.id]).toBe(item.id.startsWith("u") ? 1 : 2);
  });
  it("recognizes the specified recurring bass and moving melody even with shared attacks", () => {
    const input = [72,74,76,77].flatMap((pitch, i) => [note("u" + i, pitch, i * 96), note("l" + i, i % 2 ? 55 : 48, i * 96)]);
    const assigned = voices(input);
    for (const item of input) expect(assigned[item.id]).toBe(item.id.startsWith("u") ? 1 : 2);
  });
  it.each([false, true])("F: permits voice crossing with locked context=%s", locked => {
    const input = [note("u0", 72, 0, 192), note("l0", 60, 0, 96), note("l1", 64, 96, 96), note("u1", 68, 192, 192), note("l2", 67, 192), note("l3", 70, 288), note("u2", 72, 384, 192), note("l4", 67, 384), note("l5", 64, 480)];
    if (locked) { input[0].existingVoice = 1; input[0].voiceLocked = true; input[1].existingVoice = 2; input[1].voiceLocked = true; }
    const assigned = voices(input);
    for (const item of input) expect(assigned[item.id]).toBe(item.id.startsWith("u") ? 1 : 2);
  });
  it("G/H/I: preserves locks and source data, deterministic under shuffling", () => {
    const input = [note("a", 60, 0, 384), { ...note("b", 76, 0), existingVoice: 2 as const, voiceLocked: true }, note("c", 74, 96), note("d", 72, 192)];
    const before = structuredClone(input), first = assignNoteVoices(input);
    expect(first.assignments.find(item => item.noteId === "b")?.voice).toBe(2);
    expect(assignNoteVoices([...input].reverse())).toEqual(first);
    expect(new Set(first.assignments.map(item => item.noteId))).toEqual(new Set(input.map(item => item.id)));
    expect(input).toEqual(before);
  });
  it("bounds candidates even for dense locked events and normalizes costs", () => {
    const input = Array.from({ length: 40 }, (_, i) => ({ ...note(String(i), 40 + i, 0, 48 + i * 6), existingVoice: i % 2 ? 1 as const : 2 as const, voiceLocked: i % 3 === 0 }));
    const candidates = generateVoiceCandidates(input);
    expect(candidates.length).toBeLessThanOrEqual(16);
    for (const candidate of candidates) input.forEach((note, i) => { if (note.voiceLocked) expect(candidate[i]).toBe(note.existingVoice); });
    expect(melodicContinuityCost(30, 100)).toBe(1);
    expect(durationOverlapCost(note("a", 60, 0), note("b", 62, 48))).toBe(0.5);
    expect(durationOverlapCost(note("a", 60, 0), note("b", 62, 0))).toBe(0);
  });
  it("warns about irreducible three-layer overlaps without losing notes", () => {
    const input = [note("a", 48, 0, 384), note("b", 60, 48, 288), note("c", 72, 96, 96)];
    const result = assignNoteVoices(input);
    expect(result.assignments).toHaveLength(3); expect(result.warnings.length).toBeGreaterThan(0);
  });
});
describe("shared editor integration", () => {
  const music = () => track([note("bass", 48, 0, 384), ...[64, 65, 67, 69].map((pitch, i) => note(String(i), pitch, i * 96))]);
  it("fills missing voices once and preserves them on reopening and unrelated edits", () => {
    const original = music(), first = assignVoices({ track: original });
    expect(first.changed).toBe(true); expect(first.track.notes[0].notationVoice).toBe(2);
    expect(assignVoices({ track: first.track }).track).toBe(first.track);
    const wire = serializeNotationSnapshot(first.track);
    const restored = restoreNotationSnapshot({ ...wire, notation: undefined, notes: wire.notes.map(({ notationVoice, notationVoiceSource, notationVoiceLocked, ...note }) => note) });
    expect(restored.notes.map(note => note.notationVoice)).toEqual([2, 1, 1, 1, 1]);
    expect(assignVoices({ track: restored }).changed).toBe(false);
    const edited = { ...restored, name: "renamed" };
    expect(assignVoices({ track: edited }).track).toBe(edited);
  });
  it("preserves explicit imported/legacy and manual choices; locks survive serialization", () => {
    const manual = setScoreVoice(music(), { noteIds: [1], chordIds: [] }, 1);
    const assigned = assignVoices({ track: manual, preserveExisting: false });
    expect(assigned.track.notes[0]).toMatchObject({ notationVoice: 1, notationVoiceLocked: true, notationVoiceSource: "manual" });
    const imported = music(); imported.notes.forEach(note => { note.notationVoice = 2; note.notationVoiceSource = "import"; });
    expect(assignVoices({ track: imported, preserveExisting: false }).track).toBe(imported);
    const wire = serializeNotationSnapshot(assigned.track);
    expect(restoreNotationSnapshot({ ...wire, notation: undefined, notes: music().notes }).notes[0].notationVoiceLocked).toBe(true);
  });
  it("limits edits to selected notes while retaining the entire chord model and performance data", () => {
    const original = music();
    original.chords.push({ id: 30, startTime: 480, length: 96, originalMidi: [60, 64, 67], currentTabs: [[0, 0], [1, 0], [2, 0]], ogTabs: [] });
    const before = structuredClone(original), result = assignVoices({ track: original, scope: { noteIds: [1], chordIds: [] } });
    expect(result.track.notes.slice(1)).toEqual(before.notes.slice(1)); expect(result.track.chords).toEqual(before.chords);
    expect(original).toEqual(before);
    for (const [i, item] of result.track.notes.entries()) { const { notationVoice, notationVoiceSource, ...data } = item; expect(data).toEqual(before.notes[i]); }
    // Existing history stores whole immutable snapshots; undo/redo need no parallel voice history.
    const history = [before, result.track]; expect(history[0]).toEqual(original); expect(history[1].notes[0].notationVoice).toBeDefined();
  });
  it("does not invent Voice 1 when restoring missing transport metadata", () => {
    const source = music(), wire = serializeNotationSnapshot(source);
    expect(restoreNotationSnapshot({ ...wire, notation: undefined }).notes.every(note => note.notationVoice === undefined)).toBe(true);
  });
  it("benchmarks dense ordinary polyphony with bounded search", () => {
    const input = Array.from({ length: 256 }, (_, i) => [48, 55, 64, 67, 72, 76].map((pitch, j) => note(`${i}:${j}`, pitch + i % 3, i * 48, j < 2 ? 96 : 48))).flat();
    const start = performance.now(), result = assignNoteVoices(input), ms = performance.now() - start;
    console.info(`Voice assignment: ${input.length} notes, ${ms.toFixed(0)} ms`);
    expect(result.assignments).toHaveLength(input.length); expect(ms).toBeLessThan(10000);
  });
});
