import { describe, expect, it } from "vitest";
import { addScoreNote, addScoreRest, editScoreSelection, scoreEvents, scorePlaybackEvents, setScoreVoice, snapScorePitch, toggleScoreConnection } from "../../lib/gteNotation";
import { buildNotationScore } from "../../lib/gteNotationScore";
import { restoreNotationSnapshot, serializeNotationSnapshot, serializeNotationPayload } from "../../lib/gteNotationPersistence";
import { normalizeGuestSnapshot } from "../../lib/gteGuestDraft";
import type { EditorSnapshot } from "../../types/gte";

const empty = (): EditorSnapshot => ({ id: "piano", instrumentId: "gm:piano", notes: [], chords: [], framesPerMessure: 480,
  totalFrames: 960, fps: 240, timeSignature: 4, timeSignatureBottom: 4, optimalsByTime: {}, cutPositionsWithCoords: [] });
const pair = () => addScoreNote(addScoreNote(empty(), 64, 0, 120, "treble").snapshot, 64, 120, 120, "treble").snapshot;
const both = { noteIds: [1, 2], chordIds: [] };

describe("notation tools and persistence", () => {
  it("changes voice without moving, retuning, or shortening notes", () => {
    const source = pair(), next = setScoreVoice(source, both, 2);
    expect(next.notes.map(({ notationVoice, ...note }) => note)).toEqual(source.notes.map(({ notationVoice, ...note }) => note));
    expect(scoreEvents(next).every((event) => event.voice === 2)).toBe(true);
    expect(source.notes[0].notationVoice).toBe(1);
  });
  it("ties consecutive equal pitches into one playback event, and toggles back without destroying notes", () => {
    const source = pair(), tied = toggleScoreConnection(source, both, "ties");
    expect(tied.notes).toEqual(source.notes);
    expect(scorePlaybackEvents(tied)).toHaveLength(1);
    expect(scorePlaybackEvents(tied)[0]).toMatchObject({ start: 0, length: 240 });
    expect(scorePlaybackEvents(toggleScoreConnection(tied, both, "ties"))).toHaveLength(2);
  });
  it("rejects ties across different pitches, gaps and voices", () => {
    for (const change of [{ transpose: 1 }, { shift: 30 }]) {
      const source = editScoreSelection(pair(), { noteIds: [2], chordIds: [] }, change);
      expect(toggleScoreConnection(source, both, "ties")).toBe(source);
    }
    const otherVoice = setScoreVoice(pair(), { noteIds: [2], chordIds: [] }, 2);
    expect(toggleScoreConnection(otherVoice, both, "ties")).toBe(otherVoice);
  });
  it("keeps slurs independent from performance duration and removes broken links on deletion", () => {
    const source = editScoreSelection(pair(), { noteIds: [2], chordIds: [] }, { transpose: 4 });
    const slurred = toggleScoreConnection(source, both, "slurs");
    expect(slurred.notation?.slurs).toHaveLength(1);
    expect(scorePlaybackEvents(slurred)).toEqual(scorePlaybackEvents(source));
    expect(toggleScoreConnection(slurred, both, "slurs").notation?.slurs).toEqual([]);
    expect(editScoreSelection(slurred, { noteIds: [2], chordIds: [] }, { remove: true }).notation?.slurs).toEqual([]);
  });
  it.each([1, 2, 4, 8, 16, 32, 64])("stores and engraves a dotted 1/%i rest without creating a sounding note", (denominator) => {
    const length = 480 / denominator * 1.5;
    const snapshot = addScoreRest(empty(), { id: 1, start: 0, length, staff: "treble", voice: 2, denominator, dotted: true });
    expect(scorePlaybackEvents(snapshot)).toEqual([]);
    const score = buildNotationScore(snapshot);
    if (length <= 480) expect(score.measures[0].voices.treble[1].find((token) => token.tick === 0)).toMatchObject({ rest: true, denominator, dotted: true, hidden: false });
    else expect(score.measures[1].voices.treble[1].some((token) => !token.hidden)).toBe(true);
    for (const measure of score.measures) for (const voice of measure.voices.treble) expect(voice.reduce((sum, token) => sum + token.ticks, 0)).toBe(score.barTicks);
  });
  it("round-trips notation through the existing metadata transport after note fields are stripped", () => {
    let source = setScoreVoice(toggleScoreConnection(pair(), both, "ties"), both, 2);
    source = addScoreRest(source, { id: 1, start: 300, length: 60, denominator: 8, dotted: false, voice: 1, staff: "bass" });
    const wire = serializeNotationSnapshot(source);
    delete wire.notation;
    wire.notes = wire.notes.map(({ notationStaff, notationVoice, ...note }) => note);
    const restored = restoreNotationSnapshot(wire);
    expect(restored.notation).toEqual(source.notation);
    expect(scoreEvents(restored)).toEqual(scoreEvents(source));
    expect(scorePlaybackEvents(restored)).toHaveLength(1);
    expect(normalizeGuestSnapshot(wire).notes[0]).toMatchObject({ notationVoice: 2, notationStaff: "treble" });
  });
  it("encodes notation lanes in whole-canvas saves without modifying tab lanes or the source", () => {
    const piano = pair(), tab = { ...empty(), id: "tab", instrumentId: "guitar" };
    const canvas = { editors: [piano, tab] };
    const encoded = serializeNotationPayload(canvas);
    expect(encoded.editors[0].chordEditor?.notation).toBeDefined();
    expect(encoded.editors[1]).toBe(tab);
    expect(piano.chordEditor).toBeUndefined();
  });
  it("constrains insertion pitches to the chosen scale without mutating existing music", () => {
    const source = pair(), before = structuredClone(source);
    expect(snapScorePitch(61, 0, 0)).toBe(60);
    expect(snapScorePitch(68, 4, 1)).toBe(67);
    expect(source).toEqual(before);
  });
});
