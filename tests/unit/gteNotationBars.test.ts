import { describe, expect, it } from "vitest";
import type { EditorSnapshot } from "../../types/gte";
import { deleteNotationBars, insertNotationBars, selectNotationBars } from "../../lib/gteNotationBars";
import { restoreNotationSnapshot, serializeNotationPayload } from "../../lib/gteNotationPersistence";
import { scoreEvents } from "../../lib/gteNotation";

const lane = (): EditorSnapshot => ({ id: "piano", instrumentType: "notation", instrumentId: "upright_piano", framesPerMessure: 480, fps: 240, totalFrames: 1920,
  notes: [
    { id: 9, startTime: 480, length: 120, midiNum: 21, tab: [0,0], optimals: [], notationVoice: 2, notationStaff: "bass", velocity: .4, pitchBend: [0,20] },
    { id: 13, startTime: 600, length: 120, midiNum: 21, tab: [0,0], optimals: [], notationVoice: 2, notationStaff: "bass" },
    { id: 22, startTime: 960, length: 120, midiNum: 108, tab: [0,0], optimals: [], notationVoice: 1, notationStaff: "treble" },
  ], chords: [{ id: 6, startTime: 720, length: 120, originalMidi: [60,64], currentTabs: [[0,0],[0,0]], ogTabs: [], notationVoice: 2, velocities: [.5,.6] }],
  notation: { rests: [{ id: 8, start: 840, length: 120, voice: 2, staff: "bass", denominator: 4, dotted: false }],
    ties: [{ from: "n:9", to: "n:13" }], slurs: [{ from: "n:13", to: "c:6:0" }, { from: "c:6:0", to: "n:22" }] },
  noteEffects: [{ id: 7, startNoteId: 9, endNoteId: 13, type: 1, noteEffectLabel: "" }],
  cutPositionsWithCoords: [], optimalsByTime: {} });

describe("notation bar editing", () => {
  it("copies both staffs, voices, rests and remaps note/chord connections without mutating source", () => {
    const source = lane(), before = structuredClone(source);
    const clip = selectNotationBars(source, [1])!;
    expect(source).toEqual(before);
    expect(clip.totalFrames).toBe(480);
    expect(clip.notes[0]).toMatchObject({ id: 1, startTime: 0, midiNum: 21, notationVoice: 2, notationStaff: "bass", velocity: .4, pitchBend: [0,20] });
    expect(clip.chords[0]).toMatchObject({ id: 1, startTime: 240, originalMidi: [60,64], velocities: [.5,.6] });
    expect(clip.notation?.rests?.[0]).toMatchObject({ start: 360, length: 120, voice: 2 });
    expect(clip.notation?.ties).toEqual([{ from: "n:1", to: "n:2" }]);
    expect(clip.notation?.slurs).toEqual([{ from: "n:2", to: "c:1:0" }]);
    expect(clip.noteEffects?.[0]).toMatchObject({ startNoteId: 1, endNoteId: 2 });
  });
  it("packs disjoint bars in timeline order and excludes unselected music", () => {
    const clip = selectNotationBars(lane(), [3,1,1,-1,99])!;
    expect(clip.totalFrames).toBe(960);
    expect(clip.notes.map(note => note.midiNum)).toEqual([21,21]);
    expect(clip.chords[0].startTime).toBe(240);
    expect(selectNotationBars(lane(), [-1])).toBeNull();
  });
  it("clips held notes to the copied measure, including notes starting before it", () => {
    const source = lane(); source.notes = [{ ...source.notes[0], startTime: 420, length: 660 }]; source.chords = [];
    const clip = selectNotationBars(source, [1])!;
    expect(clip.notes[0]).toMatchObject({ startTime: 0, length: 480 });
    expect(clip.notes[0].startTime + clip.notes[0].length).toBeLessThanOrEqual(clip.totalFrames);
  });
  it("pastes with fresh IDs, shifts later music and retains independent notation metadata", () => {
    const source = lane(), before = structuredClone(source), clip = selectNotationBars(source, [1])!;
    const pasted = insertNotationBars(source, 0, clip);
    expect(source).toEqual(before);
    expect(pasted.totalFrames).toBe(2400);
    expect(pasted.notes.find(note => note.id === 9)?.startTime).toBe(960);
    expect(pasted.notes.find(note => note.id === 23)).toMatchObject({ startTime: 0, midiNum: 21, notationVoice: 2, velocity: .4 });
    expect(pasted.notation?.ties).toContainEqual({ from: "n:23", to: "n:24" });
    expect(pasted.notation?.slurs).toContainEqual({ from: "n:24", to: "c:7:0" });
    expect(pasted.notation?.rests?.map(rest => rest.start)).toEqual([1320,360]);
    expect(new Set(pasted.notation?.rests?.map(rest => rest.id)).size).toBe(2);
    expect(new Set(pasted.notes.map(note => note.id)).size).toBe(pasted.notes.length);
  });
  it("deletes measure time, removing its rests and dangling links while shifting later music", () => {
    const source = lane(), before = structuredClone(source);
    const deleted = deleteNotationBars(source, [1])!;
    expect(source).toEqual(before);
    expect(deleted.notes).toHaveLength(1);
    expect(deleted.notes[0]).toMatchObject({ id: 22, startTime: 480 });
    expect(deleted.totalFrames).toBe(1440);
    expect(deleted.notation).toMatchObject({ rests: [], ties: [], slurs: [] });
    expect(deleted.chords).toEqual([]); expect(deleted.noteEffects).toEqual([]);
  });
  it("shortens notes crossing deleted time instead of erasing their surviving music", () => {
    const source = lane(); source.notes = [{ ...source.notes[0], startTime: 420, length: 660 }]; source.chords = [];
    const result = deleteNotationBars(source, [1])!;
    expect(result.notes[0]).toMatchObject({ startTime: 420, length: 180, midiNum: 21 });
    expect(deleteNotationBars(source, [0,1,2,3])).toBeNull();
  });
  it("moves bars by copy/delete/insert without losing their notation or changing total length", () => {
    const source = lane(), clip = selectNotationBars(source, [1])!;
    const moved = insertNotationBars(deleteNotationBars(source, [1])!, 3, clip);
    expect(moved.totalFrames).toBe(source.totalFrames);
    expect(moved.notes.map(note => [note.midiNum,note.startTime])).toEqual([[108,480],[21,1440],[21,1560]]);
    expect(moved.notation?.rests?.[0].start).toBe(1800);
    expect(moved.notation?.ties).toHaveLength(1);
    const keys = new Set(scoreEvents(moved).map(event => event.key));
    for (const link of [...moved.notation!.ties!, ...moved.notation!.slurs!]) expect(keys.has(link.from) && keys.has(link.to)).toBe(true);
  });
  it("round-trips edited bars through the backend metadata adapter", () => {
    const source = lane(), pasted = insertNotationBars(source, 3, selectNotationBars(source, [1])!);
    const wire = serializeNotationPayload(pasted) as EditorSnapshot;
    delete wire.notation; delete wire.instrumentType;
    wire.notes = wire.notes.map(({ notationVoice, notationStaff, velocity, pitchBend, ...note }) => ({ ...note, midiNum: 64 }));
    const restored = restoreNotationSnapshot(wire);
    expect(restored.notation).toEqual(pasted.notation);
    expect(scoreEvents(restored)).toEqual(scoreEvents(pasted));
  });
});
