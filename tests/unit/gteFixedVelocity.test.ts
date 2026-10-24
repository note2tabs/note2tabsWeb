import { expect, it } from "vitest";
import type { EditorSnapshot } from "../../types/gte";
import { FIXED_NOTE_VELOCITY, withFixedVelocity } from "../../lib/gteFixedVelocity";
import { restoreNotationSnapshot, serializeNotationPayload } from "../../lib/gteNotationPersistence";
import { scoreEvents } from "../../lib/gteNotation";

it("normalizes old notes, chord tones and saved metadata to MIDI 100 without mutating the original", () => {
  const lane = { id: "piano", instrumentType: "notation", notes: [0, .1, 1, undefined].map((velocity, id) => ({ id, velocity, midiNum: 60 + id, startTime: id * 60, length: 60, tab: [0,0], optimals: [] })),
    chords: [{ id: 10, originalMidi: [60,64], currentTabs: [[0,0],[1,0]], velocities: [0,.2], startTime: 480, length: 60 }],
    chordEditor: { notation: { assignments: { "n:0": { velocity: 0, midi: 60 } } } },
  } as unknown as EditorSnapshot;
  const before = structuredClone(lane);
  for (const fixed of [withFixedVelocity(lane), restoreNotationSnapshot(lane), restoreNotationSnapshot({ ...lane, notation: {} }), serializeNotationPayload(lane) as EditorSnapshot]) {
    expect(fixed.notes.every(note => note.velocity === FIXED_NOTE_VELOCITY)).toBe(true);
    expect(fixed.chords[0].velocities).toEqual([FIXED_NOTE_VELOCITY, FIXED_NOTE_VELOCITY]);
    expect(scoreEvents(fixed).every(note => note.velocity === FIXED_NOTE_VELOCITY)).toBe(true);
  }
  expect(lane).toEqual(before);
  const wire = serializeNotationPayload({ editors: [lane] });
  expect(wire.editors[0].chordEditor.notation.assignments["n:0"].velocity).toBe(FIXED_NOTE_VELOCITY);
});
