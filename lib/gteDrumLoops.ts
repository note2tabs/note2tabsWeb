import type { CanvasSnapshot, DrumLoopRegion, Note } from "../types/gte";

export type MaterializedDrumNote = {
  note: Note;
  key: string;
  virtual: boolean;
  loopId?: string;
  sourceNoteId?: number;
};

const finiteFrame = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
};

export const normalizeDrumLoops = (
  value: unknown,
  totalFrames: number
): DrumLoopRegion[] => {
  if (!Array.isArray(value)) return [];
  const maxFrame = Math.max(1, Math.round(totalFrames));
  const seen = new Set<string>();
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    const sourceStart = Math.max(0, Math.min(maxFrame - 1, finiteFrame(raw.sourceStart, 0)));
    const sourceEnd = Math.max(
      sourceStart + 1,
      Math.min(maxFrame, finiteFrame(raw.sourceEnd, sourceStart + 1))
    );
    const loopEnd = Math.max(
      sourceEnd,
      Math.min(maxFrame, finiteFrame(raw.loopEnd, sourceEnd))
    );
    const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : `drum-loop-${index + 1}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, sourceStart, sourceEnd, loopEnd }];
  });
};

export const isFrameInLoopRepeat = (frame: number, loop: DrumLoopRegion) =>
  frame >= loop.sourceEnd && frame < loop.loopEnd;

export const removeNotesCoveredByLoopRepeats = (
  notes: Note[],
  loops: DrumLoopRegion[]
) => notes.filter((note) => !loops.some((loop) => isFrameInLoopRepeat(note.startTime, loop)));

export const getDrumLoopTimelineFrames = (
  loops: DrumLoopRegion[],
  currentTotalFrames: number,
  framesPerBar = 480
) => {
  const barLength = Math.max(1, Math.round(framesPerBar));
  const loopEnd = loops.reduce(
    (max, loop) => Math.max(max, finiteFrame(loop.loopEnd, 0)),
    0
  );
  return Math.max(
    barLength,
    Math.ceil(Math.max(currentTotalFrames, loopEnd) / barLength) * barLength
  );
};

export const preserveDrumLoopsAcrossCanvasUpdate = (
  next: CanvasSnapshot,
  current: CanvasSnapshot
): CanvasSnapshot => {
  const currentById = new Map(current.editors.map((lane) => [lane.id, lane]));
  return {
    ...next,
    editors: next.editors.map((lane, index) => {
      const currentLane = currentById.get(lane.id) ?? current.editors[index];
      const nextLoops = normalizeDrumLoops(lane.drumLoops, lane.totalFrames);
      const currentLoops = normalizeDrumLoops(currentLane?.drumLoops, lane.totalFrames);
      return {
        ...lane,
        drumLoops: nextLoops.length ? nextLoops : currentLoops,
      };
    }),
  };
};

export const materializeDrumLoopNotes = (
  notes: Note[],
  loops: DrumLoopRegion[],
  totalFrames: number
): MaterializedDrumNote[] => {
  const normalized = normalizeDrumLoops(loops, totalFrames);
  const physicalNotes = removeNotesCoveredByLoopRepeats(notes, normalized);
  const result: MaterializedDrumNote[] = physicalNotes.map((note) => ({
    note,
    key: `physical-${note.id}`,
    virtual: false,
  }));

  normalized.forEach((loop) => {
    const sourceLength = loop.sourceEnd - loop.sourceStart;
    if (sourceLength <= 0 || loop.loopEnd <= loop.sourceEnd) return;
    const sourceNotes = physicalNotes.filter(
      (note) => note.startTime >= loop.sourceStart && note.startTime < loop.sourceEnd
    );
    for (let offset = sourceLength; loop.sourceStart + offset < loop.loopEnd; offset += sourceLength) {
      sourceNotes.forEach((sourceNote) => {
        const startTime = sourceNote.startTime + offset;
        if (startTime >= loop.loopEnd || startTime >= totalFrames) return;
        result.push({
          note: { ...sourceNote, id: sourceNote.id, startTime },
          key: `virtual-${loop.id}-${sourceNote.id}-${offset}`,
          virtual: true,
          loopId: loop.id,
          sourceNoteId: sourceNote.id,
        });
      });
    }
  });

  return result.sort(
    (left, right) => left.note.startTime - right.note.startTime || left.note.id - right.note.id
  );
};
