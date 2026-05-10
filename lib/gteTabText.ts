import type { EditorSnapshot, Note, NoteEffect } from "../types/gte";
import { getStringLabelsForSnapshot } from "./gteTuning";

let spotsPerBar = 16;
let barsPerLine = 3;

type TabTextOptions = {
  barsPerRow?: number;
  barWidth?: number;
};

type TabEvent = {
  start: number;
  stringIndex: number;
  fret: number;
};

type NoteEvent = TabEvent & {
  id: number;
};

type NotePlacement = {
  barIndex: number;
  col: number;
  width: number;
  stringIndex: number;
};

type CanonicalNoteEffect = {
  type: number;
  startNoteId: number;
  endNoteId: number;
  noteEffectLabel: string;
};

const toSafeInt = (value: unknown, fallback: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.round(num);
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const clampEventLength = (value: unknown) => Math.max(1, toSafeInt(value, 1));

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
  const leftEnd = Math.round(startNote.startTime + clampEventLength(startNote.length));
  const rightStart = Math.round(endNote.startTime);
  const stringIndex = startNote.tab[0];
  const blocked = snapshot.notes.some((note) => {
    if (note.id === startNote.id || note.id === endNote.id) return false;
    if (note.tab[0] !== stringIndex) return false;
    const noteStart = Math.round(note.startTime);
    return leftEnd <= noteStart && noteStart <= rightStart;
  });
  if (blocked) return null;

  const type = effect.type === 1 ? 1 : effect.type === 2 ? 2 : 0;
  return {
    type,
    startNoteId: startNote.id,
    endNoteId: endNote.id,
    noteEffectLabel: effect.noteEffectLabel || getNoteEffectLabelForNotes(type, startNote, endNote),
  };
};

const collectEvents = (snapshot: EditorSnapshot): TabEvent[] => {
  const events: TabEvent[] = [];

  snapshot.chords.forEach((chord) => {
    const start = toSafeInt(chord.startTime, 0);
    chord.currentTabs.forEach((tab) => {
      const stringIndex = toSafeInt(tab?.[0], -1);
      const fret = toSafeInt(tab?.[1], -1);
      if (stringIndex < 0 || stringIndex > 5 || fret < 0) return;
      events.push({ start, stringIndex, fret });
    });
  });

  return events.sort(
    (a, b) => a.start - b.start || a.stringIndex - b.stringIndex || a.fret - b.fret
  );
};

const collectNoteEvents = (snapshot: EditorSnapshot): NoteEvent[] =>
  snapshot.notes
    .map((note) => {
      const stringIndex = toSafeInt(note.tab?.[0], -1);
      const fret = toSafeInt(note.tab?.[1], -1);
      const start = toSafeInt(note.startTime, 0);
      if (stringIndex < 0 || stringIndex > 5 || fret < 0) return null;
      return { id: note.id, start, stringIndex, fret };
    })
    .filter((event): event is NoteEvent => event !== null)
    .sort((a, b) => a.start - b.start || a.stringIndex - b.stringIndex || a.fret - b.fret || a.id - b.id);

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

const canWriteAt = (line: string[], at: number, value: string) => {
  for (let idx = 0; idx < value.length; idx += 1) {
    if (line[at + idx] !== "-") return false;
  }
  return true;
};

const writeFret = (line: string[], startCol: number, fret: number) => {
  const text = String(Math.max(0, fret));
  const maxStart = Math.max(0, line.length - text.length);
  let col = clamp(startCol, 0, maxStart);

  if (!canWriteAt(line, col, text)) {
    let placed = false;
    for (let probe = col + 1; probe <= maxStart; probe += 1) {
      if (canWriteAt(line, probe, text)) {
        col = probe;
        placed = true;
        break;
      }
    }
    if (!placed) {
      for (let probe = col - 1; probe >= 0; probe -= 1) {
        if (canWriteAt(line, probe, text)) {
          col = probe;
          placed = true;
          break;
        }
      }
    }
    if (!placed) return null;
  }

  for (let idx = 0; idx < text.length; idx += 1) {
    line[col + idx] = text[idx];
  }

  return { col, width: text.length };
};

const writeEffectPoint = (
  bars: string[][][],
  barWidth: number,
  stringIndex: number,
  barIndex: number,
  col: number,
  value: string
) => {
  const safeBarIndex = clamp(barIndex, 0, bars.length - 1);
  const safeCol = clamp(col, 0, barWidth - 1);
  const line = bars[safeBarIndex]?.[stringIndex];
  if (!line) return;
  if (line[safeCol] !== "-") return;
  line[safeCol] = value;
};

const writeEffectBetweenNotes = (
  bars: string[][][],
  barWidth: number,
  start: NotePlacement,
  end: NotePlacement,
  label: string,
  _type: number
) => {
  const startIndex = start.barIndex * barWidth + start.col + start.width;
  const endIndex = end.barIndex * barWidth + end.col - 1;
  if (endIndex < startIndex) return;

  const centerIndex = Math.floor((startIndex + endIndex) / 2);
  const barIndex = Math.floor(centerIndex / barWidth);
  const col = centerIndex % barWidth;
  writeEffectPoint(bars, barWidth, start.stringIndex, barIndex, col, label);
};

export function buildTabTextFromSnapshot(
  snapshot: EditorSnapshot,
  { barsPerRow = barsPerLine, barWidth = spotsPerBar * 2 }: TabTextOptions = {}
) {
  const safeBarsPerRow = Math.max(1, Math.round(barsPerRow));
  const safeBarWidth = Math.max(8, Math.round(barWidth));
  const framesPerBar = Math.max(1, toSafeInt(snapshot.framesPerMessure, 480));
  const events = collectEvents(snapshot);
  const noteEvents = collectNoteEvents(snapshot);
  const notePlacements = new Map<number, NotePlacement>();
  const latestEventStart = [...events, ...noteEvents].length
    ? Math.max(...[...events, ...noteEvents].map((event) => event.start))
    : 0;
  const baseTotalFrames = Math.max(
    framesPerBar,
    toSafeInt(snapshot.totalFrames, framesPerBar),
    latestEventStart + 1
  );
  const totalBars = Math.max(1, Math.ceil(baseTotalFrames / framesPerBar));

  const bars = Array.from({ length: totalBars }, () =>
    Array.from({ length: 6 }, () => Array.from({ length: safeBarWidth }, () => "-"))
  );

  events.forEach((event) => {
    const barIndex = clamp(Math.floor(event.start / framesPerBar), 0, totalBars - 1);
    const inBarFrame = event.start - barIndex * framesPerBar;
    const col = clamp(
      Math.round((inBarFrame / framesPerBar) * (safeBarWidth - 1)),
      0,
      safeBarWidth - 1
    );
    writeFret(bars[barIndex][event.stringIndex], col, event.fret);
  });

  noteEvents.forEach((event) => {
    const barIndex = clamp(Math.floor(event.start / framesPerBar), 0, totalBars - 1);
    const inBarFrame = event.start - barIndex * framesPerBar;
    const col = clamp(
      Math.round((inBarFrame / framesPerBar) * (safeBarWidth - 1)),
      0,
      safeBarWidth - 1
    );
    const placement = writeFret(bars[barIndex][event.stringIndex], col, event.fret);
    if (!placement) return;
    notePlacements.set(event.id, {
      barIndex,
      col: placement.col,
      width: placement.width,
      stringIndex: event.stringIndex,
    });
  });

  collectCanonicalNoteEffects(snapshot).forEach((effect) => {
    const start = notePlacements.get(effect.startNoteId);
    const end = notePlacements.get(effect.endNoteId);
    if (!start || !end) return;
    if (start.stringIndex !== end.stringIndex) return;
    const label = effect.noteEffectLabel || "b";
    writeEffectBetweenNotes(bars, safeBarWidth, start, end, label[0], effect.type);
  });

  const rows: string[] = [];
  const stringLabels = getStringLabelsForSnapshot(snapshot);
  for (let rowStart = 0; rowStart < totalBars; rowStart += safeBarsPerRow) {
    const rowEnd = Math.min(totalBars, rowStart + safeBarsPerRow);
    for (let stringIndex = 0; stringIndex < stringLabels.length; stringIndex += 1) {
      let line = `${stringLabels[stringIndex]}|`;
      for (let barIndex = rowStart; barIndex < rowEnd; barIndex += 1) {
        line += `${bars[barIndex][stringIndex].join("")}|`;
      }
      rows.push(line);
    }
    if (rowEnd < totalBars) rows.push("");
  }

  return rows.join("\n");
}
