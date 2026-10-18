import { describe, expect, it } from "vitest";
import { snapSelectionToKey } from "../../lib/gteSnapSelectionToKey";
import { getTabMidi } from "../../lib/gteTuning";
import type { EditorSnapshot, TabCoord } from "../../types/gte";

const fixture = (): EditorSnapshot => ({ id: "key", fps: 240, framesPerMessure: 480, totalFrames: 960, cutPositionsWithCoords: [], optimalsByTime: {},
  notes: [{ id: 1, startTime: 10, length: 80, tab: [1, 2], midiNum: 61, optimals: [] }],
  chords: [1, 2].map((id) => ({ id, startTime: id * 200, length: 140, currentTabs: [[0, 2], [1, 4]] as TabCoord[], ogTabs: [[0, 2], [1, 4]] as TabCoord[], originalMidi: [66, 63], velocities: [70, 90], pitchBends: [[0, 1], []], fingeringIndex: 2 })),
});
const snapC = (snapshot: EditorSnapshot, tab: TabCoord): TabCoord => {
  const allowed = [0, 2, 4, 5, 7, 9, 11];
  return allowed.includes(getTabMidi(snapshot, tab) % 12) ? [...tab] : [tab[0], Math.max(0, tab[1] - 1)];
};
describe("snap notes and chords to key", () => {
  it("snaps chords alone, preserving their identity, timing and dynamics", () => {
    const source = fixture(), before = structuredClone(source);
    const result = snapSelectionToKey(source, [], [1], snapC);
    expect(result.changed).toBe(true);
    const chord = result.snapshot.chords[0];
    expect(chord.currentTabs).toEqual([[0, 1], [1, 3]]);
    expect(chord.originalMidi).toEqual([65, 62]);
    expect(chord.ogTabs).toEqual(chord.currentTabs);
    expect(chord).toMatchObject({ id: 1, startTime: 200, length: 140, velocities: [70, 90], pitchBends: [[0, 1], []], fingeringIndex: 0 });
    expect(result.snapshot.chords[1]).toEqual(source.chords[1]);
    expect(result.snapshot.notes).toEqual(source.notes);
    expect(source).toEqual(before);
    expect(snapSelectionToKey(result.snapshot, [], [1], snapC).changed).toBe(false);
  });
  it("handles mixed selections and keeps equal pitches on separate strings", () => {
    const source = fixture();
    expect(snapSelectionToKey(source, [1], [1, 2], snapC).snapshot.notes[0].tab).toEqual([1, 1]);
    source.chords[0].currentTabs = [[0, 1], [1, 6]];
    const duplicatePitch = snapSelectionToKey(source, [], [1], () => [0, 0]);
    const tabs = duplicatePitch.snapshot.chords[0].currentTabs;
    expect(new Set(tabs.map((tab) => tab[0])).size).toBe(2);
    expect(tabs.map((tab) => getTabMidi(source, tab))).toEqual([64, 64]);
  });
  it("does not mutate the source if the snapped chord cannot fit on distinct strings", () => {
    const source = fixture();
    source.chords[0].currentTabs = [0, 1, 2, 3, 4, 5].map((string) => [string, 0]);
    const before = structuredClone(source);
    expect(() => snapSelectionToKey(source, [1], [1], () => [0, 0])).toThrow(/string conflicts/);
    expect(source).toEqual(before);
  });
});
