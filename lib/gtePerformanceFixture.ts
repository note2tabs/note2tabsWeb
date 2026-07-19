import type { CanvasSnapshot, EditorSnapshot, Note, NoteEffect, TabCoord } from "../types/gte";
import { buildTabRefForTuning } from "./gteTuning";

const FIXED_FRAMES_PER_BAR = 480;
const DEFAULT_SECONDS_PER_BAR = 2;
const STANDARD_TUNING = [64, 59, 55, 50, 45, 40];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const buildCutRegions = (bars: number): EditorSnapshot["cutPositionsWithCoords"] =>
  Array.from({ length: bars }, (_, index) => {
    const start = index * FIXED_FRAMES_PER_BAR;
    return [
      [start, start + FIXED_FRAMES_PER_BAR],
      [index % 6, index % 12],
    ] as [[number, number], TabCoord];
  });

const makeNote = (id: number, bar: number, laneIndex: number, slot: number): Note => {
  const denseOffset = bar % 12 === 0 ? slot * 4 : slot * 24;
  const startTime = bar * FIXED_FRAMES_PER_BAR + denseOffset + (laneIndex % 3) * 3;
  const stringIndex = (slot + laneIndex + bar) % 6;
  const fret = clamp((bar + slot * 2 + laneIndex) % 18, 0, 22);
  const length = [36, 48, 72, 96, 120, 180][(bar + slot + laneIndex) % 6];
  return {
    id,
    startTime,
    length,
    midiNum: STANDARD_TUNING[stringIndex] + fret,
    tab: [stringIndex, fret],
    optimals: [],
  };
};

const buildLane = (laneIndex: number, bars: number, notesPerLane: number): EditorSnapshot => {
  const tabRef = buildTabRefForTuning(STANDARD_TUNING, 0, 22);
  const notes: Note[] = [];
  let noteId = 1;
  for (let bar = 0; bar < bars && notes.length < notesPerLane; bar += 1) {
    const slots = bar % 12 === 0 ? 12 : bar % 5 === 0 ? 8 : 6;
    for (let slot = 0; slot < slots && notes.length < notesPerLane; slot += 1) {
      notes.push(makeNote(noteId, bar, laneIndex, slot));
      noteId += 1;
    }
  }

  const noteEffects: NoteEffect[] = [];
  for (let index = 0; index + 1 < notes.length && noteEffects.length < 24; index += 37) {
    const first = notes[index];
    const second = notes.slice(index + 1, Math.min(notes.length, index + 80)).find(
      (candidate) => candidate.tab[0] === first.tab[0] && candidate.startTime >= first.startTime
    );
    if (!second) continue;
    noteEffects.push({
      id: noteEffects.length + 1,
      startNoteId: first.id,
      endNoteId: second.id,
      type: noteEffects.length % 2 === 0 ? 0 : 2,
      noteEffectLabel: noteEffects.length % 2 === 0 ? "Bend" : "Slide",
    });
  }

  return {
    id: `perf-lane-${laneIndex + 1}`,
    name: `Performance Track ${laneIndex + 1}`,
    framesPerMessure: FIXED_FRAMES_PER_BAR,
    fps: FIXED_FRAMES_PER_BAR / DEFAULT_SECONDS_PER_BAR,
    secondsPerBar: DEFAULT_SECONDS_PER_BAR,
    totalFrames: bars * FIXED_FRAMES_PER_BAR,
    notes,
    chords: [],
    noteEffects,
    cutPositionsWithCoords: buildCutRegions(bars),
    optimalsByTime: {},
    tabRef,
    tuning: {
      presetId: "standard",
      capo: 0,
      openStringMidi: STANDARD_TUNING,
    },
    instrumentId: laneIndex % 2 === 0 ? "builtin:nylon-guitar" : "builtin:steel-guitar",
    trackType: "tab",
    editorType: "tab",
    type: "tab",
  };
};

export const buildGtePerformanceFixture = (): CanvasSnapshot => {
  const trackCount = 5;
  const bars = 120;
  const notesPerLane = 900;
  const editors = Array.from({ length: trackCount }, (_, laneIndex) =>
    buildLane(laneIndex, bars, notesPerLane)
  );
  return {
    id: "gte-performance-fixture",
    name: "GTE Performance Fixture",
    version: 1,
    secondsPerBar: DEFAULT_SECONDS_PER_BAR,
    updatedAt: new Date(0).toISOString(),
    editors,
  };
};
