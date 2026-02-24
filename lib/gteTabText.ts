import type { EditorSnapshot } from "../types/gte";

const STRING_LABELS = ["e", "B", "G", "D", "A", "E"];

type TabTextOptions = {
  barsPerRow?: number;
  barWidth?: number;
};

type TabEvent = {
  start: number;
  stringIndex: number;
  fret: number;
};

const toSafeInt = (value: unknown, fallback: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.round(num);
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const collectEvents = (snapshot: EditorSnapshot): TabEvent[] => {
  const events: TabEvent[] = [];

  snapshot.notes.forEach((note) => {
    const stringIndex = toSafeInt(note.tab?.[0], -1);
    const fret = toSafeInt(note.tab?.[1], -1);
    const start = toSafeInt(note.startTime, 0);
    if (stringIndex < 0 || stringIndex > 5 || fret < 0) return;
    events.push({ start, stringIndex, fret });
  });

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
    if (!placed) return;
  }

  for (let idx = 0; idx < text.length; idx += 1) {
    line[col + idx] = text[idx];
  }
};

export function buildTabTextFromSnapshot(
  snapshot: EditorSnapshot,
  { barsPerRow = 3, barWidth = 32 }: TabTextOptions = {}
) {
  const safeBarsPerRow = Math.max(1, Math.round(barsPerRow));
  const safeBarWidth = Math.max(8, Math.round(barWidth));
  const framesPerBar = Math.max(1, toSafeInt(snapshot.framesPerMessure, 480));
  const events = collectEvents(snapshot);
  const latestEventStart = events.length ? Math.max(...events.map((event) => event.start)) : 0;
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

  const rows: string[] = [];
  for (let rowStart = 0; rowStart < totalBars; rowStart += safeBarsPerRow) {
    const rowEnd = Math.min(totalBars, rowStart + safeBarsPerRow);
    for (let stringIndex = 0; stringIndex < STRING_LABELS.length; stringIndex += 1) {
      let line = `${STRING_LABELS[stringIndex]}|`;
      for (let barIndex = rowStart; barIndex < rowEnd; barIndex += 1) {
        line += `${bars[barIndex][stringIndex].join("")}|`;
      }
      rows.push(line);
    }
    if (rowEnd < totalBars) rows.push("");
  }

  return rows.join("\n");
}
