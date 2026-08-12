import type { EditorSnapshot, Note, NoteEffect, TabCoord } from "../types/gte";
import { getStringLabelsForSnapshot } from "./gteTuning";

export type EditorTabViewString = {
  label: string;
  y: number;
};

export type EditorTabViewPlacement = {
  key: string;
  startTime: number;
  stringIndex: number;
  fret: number;
  x: number;
};

export type EditorTabViewEffect = {
  key: string;
  label: string;
  stringIndex: number;
  x: number;
  x1: number;
  x2: number;
};

export type EditorTabViewBarLine = {
  key: string;
  x: number;
};

export type EditorTabViewModel = {
  strings: EditorTabViewString[];
  barLines: EditorTabViewBarLine[];
  barWidths: number[];
  barStartXs: number[];
  placements: EditorTabViewPlacement[];
  effects: EditorTabViewEffect[];
  barCount: number;
  barWidth: number;
  width: number;
  height: number;
  cursorX: number;
  cursorAnchors: TimedVisualAnchor[];
};

type BuildEditorTabViewOptions = {
  framesPerBar: number;
  beatsPerBar: number;
  scale: number;
  playheadFrame: number;
  minBarCount?: number;
  variableBarWidths?: boolean;
  collapseConsecutiveEmptyBars?: boolean;
};

export type TimedVisualAnchor = {
  time: number;
  x: number;
};

type NotePlacement = EditorTabViewPlacement & {
  noteId: number;
};

type CanonicalNoteEffect = {
  type: number;
  startNoteId: number;
  endNoteId: number;
  noteEffectLabel: string;
};

const DEFAULT_LABELS = ["E", "B", "G", "D", "A", "E"];
const STRING_COUNT = 6;
const LEFT_LABEL_WIDTH = 30;
const RIGHT_PADDING = 32;
const TOP_PADDING = 16;
const STRING_GAP = 24;
const NUMBER_WIDTH = 18;
const COLLAPSED_EMPTY_BAR_RUN_WIDTH = 72;

const toSafeInt = (value: unknown, fallback: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.round(num);
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizeTab = (tab: TabCoord | undefined): TabCoord | null => {
  const stringIndex = toSafeInt(tab?.[0], -1);
  const fret = toSafeInt(tab?.[1], -1);
  if (stringIndex < 0 || stringIndex >= STRING_COUNT || fret < 0) return null;
  return [stringIndex, fret];
};

const getNoteEffectLabelForNotes = (type: number, startNote: Note, endNote: Note) => {
  if (type === 0) return "b";
  if (type === 1) return endNote.tab[1] - startNote.tab[1] >= 0 ? "h" : "p";
  if (type === 2) return endNote.tab[1] - startNote.tab[1] >= 0 ? "/" : "\\";
  return "";
};

const getCanonicalNoteEffectForSnapshot = (
  snapshot: EditorSnapshot,
  effect: NoteEffect
): CanonicalNoteEffect | null => {
  const first = snapshot.notes.find((note) => note.id === effect.startNoteId);
  const second = snapshot.notes.find((note) => note.id === effect.endNoteId);
  if (!first || !second) return null;
  if (first.id === second.id) return null;
  if (first.tab[0] !== second.tab[0]) return null;

  const ordered =
    first.startTime < second.startTime || (first.startTime === second.startTime && first.id <= second.id)
      ? [first, second]
      : [second, first];
  const [startNote, endNote] = ordered;
  const type = effect.type === 1 ? 1 : effect.type === 2 ? 2 : 0;

  return {
    type,
    startNoteId: startNote.id,
    endNoteId: endNote.id,
    noteEffectLabel: effect.noteEffectLabel || getNoteEffectLabelForNotes(type, startNote, endNote),
  };
};

const collectCanonicalNoteEffects = (snapshot: EditorSnapshot): CanonicalNoteEffect[] => {
  const seen = new Set<string>();
  const normalized: CanonicalNoteEffect[] = [];

  (snapshot.noteEffects || []).forEach((effect) => {
    const canonical = getCanonicalNoteEffectForSnapshot(snapshot, effect);
    if (!canonical) return;
    const key = `${canonical.startNoteId}:${canonical.endNoteId}`;
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(canonical);
  });

  return normalized;
};

const getRoundedX = (
  startTime: number,
  framesPerBar: number,
  slotsPerBar: number,
  slotWidth: number,
  barCount: number
) => {
  const framesPerSlot = framesPerBar / Math.max(1, slotsPerBar);
  const totalSlots = Math.max(1, barCount * slotsPerBar);
  const absoluteSlot = clamp(
    Math.round(Math.max(0, startTime) / Math.max(1, framesPerSlot) - 0.5),
    0,
    totalSlots - 1
  );
  return LEFT_LABEL_WIDTH + absoluteSlot * slotWidth + slotWidth / 2;
};

export const getEditorTabViewCursorX = (
  anchors: TimedVisualAnchor[],
  playheadFrame: number,
  timelineEnd: number,
  width: number
) => {
  const safeFrame = clamp(playheadFrame, 0, Math.max(1, timelineEnd));
  const minX = LEFT_LABEL_WIDTH;
  const maxX = Math.max(minX, width - RIGHT_PADDING);
  if (!anchors.length) {
    return minX + (safeFrame / Math.max(1, timelineEnd)) * (maxX - minX);
  }

  if (safeFrame <= anchors[0].time) {
    const progress = anchors[0].time <= 0 ? 1 : safeFrame / anchors[0].time;
    return minX + clamp(progress, 0, 1) * (anchors[0].x - minX);
  }

  for (let idx = 0; idx < anchors.length - 1; idx += 1) {
    const left = anchors[idx];
    const right = anchors[idx + 1];
    if (safeFrame < right.time) {
      const span = Math.max(1, right.time - left.time);
      const progress = (safeFrame - left.time) / span;
      return left.x + clamp(progress, 0, 1) * (right.x - left.x);
    }
  }

  const last = anchors[anchors.length - 1];
  const tail = Math.max(1, timelineEnd - last.time);
  const progress = (safeFrame - last.time) / tail;
  return last.x + clamp(progress, 0, 1) * (maxX - last.x);
};

export const buildEditorTabView = (
  snapshot: EditorSnapshot,
  {
    framesPerBar,
    beatsPerBar,
    scale,
    playheadFrame,
    minBarCount,
    variableBarWidths = false,
    collapseConsecutiveEmptyBars = false,
  }: BuildEditorTabViewOptions
): EditorTabViewModel => {
  const safeFramesPerBar = Math.max(1, Math.round(framesPerBar));
  const safeBeatsPerBar = Math.max(1, Math.round(beatsPerBar));
  const slotsPerBar = safeBeatsPerBar * 2;
  const labels = getStringLabelsForSnapshot(snapshot);
  const stringLabels = labels.length === STRING_COUNT ? labels : DEFAULT_LABELS;
  const barWidth = safeFramesPerBar * Math.max(0.1, scale);
  const slotWidth = barWidth / slotsPerBar;
  const maxNoteFrame = snapshot.notes.reduce((max, note) => Math.max(max, toSafeInt(note.startTime, 0)), 0);
  const maxChordFrame = snapshot.chords.reduce((max, chord) => Math.max(max, toSafeInt(chord.startTime, 0)), 0);
  const totalFrames = Math.max(safeFramesPerBar, toSafeInt(snapshot.totalFrames, safeFramesPerBar), maxNoteFrame, maxChordFrame);
  const barCount = Math.max(
    1,
    Math.ceil(totalFrames / safeFramesPerBar),
    Number.isFinite(minBarCount) ? Math.round(minBarCount || 0) : 0
  );
  const onsetTimesByBar = Array.from({ length: barCount }, () => new Set<number>());
  snapshot.notes.forEach((note) => {
    const startTime = Math.max(0, toSafeInt(note.startTime, 0));
    const barIndex = clamp(Math.floor(startTime / safeFramesPerBar), 0, barCount - 1);
    onsetTimesByBar[barIndex].add(startTime);
  });
  snapshot.chords.forEach((chord) => {
    const startTime = Math.max(0, toSafeInt(chord.startTime, 0));
    const barIndex = clamp(Math.floor(startTime / safeFramesPerBar), 0, barCount - 1);
    onsetTimesByBar[barIndex].add(startTime);
  });
  const maximumDenseOnsets = Math.max(
    5,
    ...onsetTimesByBar.map((times) => times.size)
  );
  const denseBarWidth = Math.max(176, 28 + maximumDenseOnsets * 22);
  const barWidths = onsetTimesByBar.map((times) => {
    if (!variableBarWidths) return barWidth;
    if (times.size === 0) return 42;
    return times.size <= 4 ? 112 : denseBarWidth;
  });
  if (variableBarWidths && collapseConsecutiveEmptyBars) {
    let startIndex = 0;
    while (startIndex < barCount) {
      if (onsetTimesByBar[startIndex].size > 0) {
        startIndex += 1;
        continue;
      }
      let endIndex = startIndex + 1;
      while (endIndex < barCount && onsetTimesByBar[endIndex].size === 0) {
        endIndex += 1;
      }
      const runLength = endIndex - startIndex;
      if (runLength > 1) {
        const sharedWidth = COLLAPSED_EMPTY_BAR_RUN_WIDTH / runLength;
        for (let index = startIndex; index < endIndex; index += 1) {
          barWidths[index] = sharedWidth;
        }
      }
      startIndex = endIndex;
    }
  }
  const barStartXs = [LEFT_LABEL_WIDTH];
  barWidths.forEach((currentBarWidth) => {
    barStartXs.push(barStartXs[barStartXs.length - 1] + currentBarWidth);
  });
  const width = barStartXs[barStartXs.length - 1] + RIGHT_PADDING;
  const height = TOP_PADDING * 2 + (STRING_COUNT - 1) * STRING_GAP;
  const strings = stringLabels.map((label, stringIndex) => ({
    label,
    y: TOP_PADDING + stringIndex * STRING_GAP,
  }));
  const barLines = Array.from({ length: barCount + 1 }, (_, barIndex) => ({
    key: `bar-${barIndex}`,
    x: barStartXs[barIndex],
  }));
  const notePlacements = new Map<number, NotePlacement>();
  const placements: EditorTabViewPlacement[] = [];
  const getPlacementX = (startTime: number) => {
    if (!variableBarWidths) {
      return getRoundedX(startTime, safeFramesPerBar, slotsPerBar, slotWidth, barCount);
    }
    const barIndex = clamp(Math.floor(startTime / safeFramesPerBar), 0, barCount - 1);
    const onsetTimes = [...onsetTimesByBar[barIndex]].sort((left, right) => left - right);
    const onsetIndex = Math.max(0, onsetTimes.indexOf(startTime));
    const currentBarWidth = barWidths[barIndex];
    const horizontalPadding = Math.min(16, currentBarWidth * 0.2);
    if (onsetTimes.length <= 1) {
      return barStartXs[barIndex] + currentBarWidth / 2;
    }
    return (
      barStartXs[barIndex] +
      horizontalPadding +
      (onsetIndex / (onsetTimes.length - 1)) *
        (currentBarWidth - horizontalPadding * 2)
    );
  };

  snapshot.notes.forEach((note) => {
    const tab = normalizeTab(note.tab);
    if (!tab) return;
    const startTime = Math.max(0, toSafeInt(note.startTime, 0));
    const placement: NotePlacement = {
      key: `note-${note.id}`,
      noteId: note.id,
      startTime,
      stringIndex: tab[0],
      fret: tab[1],
      x: getPlacementX(startTime),
    };
    notePlacements.set(note.id, placement);
    placements.push(placement);
  });

  snapshot.chords.forEach((chord) => {
    const startTime = Math.max(0, toSafeInt(chord.startTime, 0));
    const x = getPlacementX(startTime);
    chord.currentTabs.forEach((rawTab, tabIndex) => {
      const tab = normalizeTab(rawTab);
      if (!tab) return;
      placements.push({
        key: `chord-${chord.id}-${tabIndex}`,
        startTime,
        stringIndex: tab[0],
        fret: tab[1],
        x,
      });
    });
  });

  const effects = collectCanonicalNoteEffects(snapshot)
    .map((effect) => {
      const start = notePlacements.get(effect.startNoteId);
      const end = notePlacements.get(effect.endNoteId);
      if (!start || !end) return null;
      if (start.stringIndex !== end.stringIndex) return null;
      return {
        key: `effect-${effect.startNoteId}-${effect.endNoteId}`,
        label: (effect.noteEffectLabel || "b")[0],
        stringIndex: start.stringIndex,
        x: (start.x + end.x) / 2,
        x1: start.x + NUMBER_WIDTH * 0.35,
        x2: end.x - NUMBER_WIDTH * 0.35,
      };
    })
    .filter((effect): effect is EditorTabViewEffect => effect !== null);

  const timedAnchors = [
    ...(variableBarWidths
      ? barStartXs.map((x, barIndex) => ({
          time: barIndex * safeFramesPerBar,
          x,
        }))
      : []),
    ...placements.map((placement) => ({ time: placement.startTime, x: placement.x })),
  ];
  const anchors = [...new Map(timedAnchors.map((anchor) => [anchor.time, anchor])).values()]
    .sort((a, b) => a.time - b.time || a.x - b.x)
    .filter(
      (anchor, index, source) =>
        index === 0 ||
        anchor.time !== source[index - 1].time ||
        anchor.x !== source[index - 1].x
    );

  return {
    strings,
    barLines,
    barWidths,
    barStartXs,
    placements: placements.sort((a, b) => a.startTime - b.startTime || a.stringIndex - b.stringIndex || a.fret - b.fret),
    effects,
    barCount,
    barWidth,
    width,
    height,
    cursorX: getEditorTabViewCursorX(anchors, playheadFrame, barCount * safeFramesPerBar, width),
    cursorAnchors: anchors,
  };
};
