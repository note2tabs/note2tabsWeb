import type { CutWithCoord, EditorSnapshot, TabCoord } from "../types/gte";
import { getMaxFretFromSnapshot, getOpenStringMidiFromSnapshot, getTabMidi } from "./gteTuning";

type Stamp = [number, TabCoord, number];
type SignedSegment = [number, number];

const BACKEND_BLUR_SIZE = 80;
const BACKEND_CUT_MARGIN = 5;
const BACKEND_BARS_PER_CHUNK = 4;
const backendAnchorString = (stringCount: number) => Math.max(0, Math.min(2, stringCount - 1));

const bankersRound = (value: number) => {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
};

// scipy.ndimage's default `reflect` mode (half-sample symmetric).
const reflectIndex = (index: number, length: number) => {
  if (length <= 1) return 0;
  let result = index;
  while (result < 0 || result >= length) {
    result = result < 0 ? -result - 1 : 2 * length - result - 1;
  }
  return result;
};

const convolveReflect = (values: number[], kernel: number[]) => {
  const center = Math.floor(kernel.length / 2);
  return values.map((_, outputIndex) =>
    kernel.reduce(
      (sum, weight, kernelIndex) =>
        sum + weight * values[reflectIndex(outputIndex + center - kernelIndex, values.length)],
      0
    )
  );
};

const interpolateMissing = (values: Array<number | null>) => {
  const valid = values
    .map((value, index) => (value === null ? null : { index, value }))
    .filter((item): item is { index: number; value: number } => item !== null);
  if (!valid.length) return values.map(() => 0);
  return values.map((value, index) => {
    if (value !== null) return value;
    const rightIndex = valid.findIndex((item) => item.index > index);
    if (rightIndex < 0) return valid[valid.length - 1].value;
    if (rightIndex === 0) return valid[0].value;
    const left = valid[rightIndex - 1];
    const right = valid[rightIndex];
    return left.value + ((right.value - left.value) * (index - left.index)) / (right.index - left.index);
  });
};

const findSignedSegments = (values: number[], positive: boolean): SignedSegment[] => {
  const result: SignedSegment[] = [];
  let start: number | null = null;
  values.forEach((value, index) => {
    const active = positive ? value > 0 : value < 0;
    if (active && start === null) start = index;
    if (!active && start !== null) {
      result.push([start, index - 1]);
      start = null;
    }
  });
  if (start !== null) result.push([start, values.length - 1]);
  return result;
};

const mergeTransitionSegments = (segments: SignedSegment[]): SignedSegment[] => {
  const ordered = segments
    .map(([start, end]): SignedSegment => [Math.min(start, end), Math.max(start, end)])
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged: SignedSegment[] = [];
  ordered.forEach(([start, end]) => {
    const previous = merged[merged.length - 1];
    if (previous && start <= previous[1]) {
      previous[1] = Math.max(previous[1], end);
      return;
    }
    merged.push([start, end]);
  });
  return merged;
};

const squareOptimizer = (midis: number[], openStrings: number[], fretCount: number) => {
  const uniques = new Set(midis);
  const foundRanges: Array<[number, number, number]> = [];
  for (let startFret = 0; startFret < fretCount; startFret += 1) {
    const found = new Set<number>();
    openStrings.forEach((base) => {
      const midi = base + startFret;
      if (uniques.has(midi)) found.add(midi);
    });
    if (!found.size) continue;
    if (midis.every((midi) => found.has(midi))) {
      foundRanges.push([startFret, startFret, startFret / 10]);
      continue;
    }
    for (let endFret = startFret + 1; endFret < fretCount; endFret += 1) {
      openStrings.forEach((base) => {
        const midi = base + endFret;
        if (uniques.has(midi)) found.add(midi);
      });
      if (midis.every((midi) => found.has(midi))) {
        foundRanges.push([startFret, endFret, startFret / 10]);
        break;
      }
    }
  }
  if (!foundRanges.length) return 0;
  const best = foundRanges.reduce((left, right) =>
    Math.abs(right[1] - right[0]) + right[2] < Math.abs(left[1] - left[0]) + left[2] ? right : left
  );
  return bankersRound((best[0] + best[1]) / 2);
};

const rankTabsLikeBackend = (
  midi: number,
  coord: TabCoord,
  openStrings: number[],
  fretCount: number
) =>
  openStrings
    .map((base, stringIndex) => [stringIndex, midi - base] as TabCoord)
    .filter(([, fret]) => fret >= 0 && fret < fretCount)
    .map((tab, index) => ({
      tab,
      index,
      distance: tab[1] === 0
        ? 0
        : (coord[0] - tab[0]) ** 2 * 0.1 + ((coord[1] - tab[1]) * 3) ** 2,
    }))
    .sort((left, right) => left.distance - right.distance || left.index - right.index)
    .map(({ tab }) => tab);

const assignBackendStyleOptimals = (snapshot: EditorSnapshot) => {
  const openStrings = getOpenStringMidiFromSnapshot(snapshot);
  const fretCount = getMaxFretFromSnapshot(snapshot) + 1;
  const regions = snapshot.cutPositionsWithCoords;
  snapshot.notes.forEach((note) => {
    let active = regions[0];
    regions.forEach((region) => {
      if (note.startTime >= region[0][0]) active = region;
    });
    const midi = Math.trunc(Number(note.midiNum));
    note.optimals = Number.isFinite(midi) && active
      ? rankTabsLikeBackend(midi, active[1], openStrings, fretCount)
      : [];
  });
};

const buildWindowRegions = (
  snapshot: EditorSnapshot,
  stamps: Stamp[],
  windowStart: number,
  windowEnd: number
): CutWithCoord[] => {
  const duration = Math.max(0, windowEnd - windowStart);
  if (!duration) return [];
  const localStamps = stamps.flatMap(([start, tab, length]): Stamp[] => {
    const overlapStart = Math.max(windowStart, start);
    const overlapEnd = Math.min(windowEnd, start + length);
    return overlapEnd > overlapStart ? [[overlapStart - windowStart, [...tab] as TabCoord, overlapEnd - overlapStart]] : [];
  });
  if (!localStamps.length) return [];

  const midiAtFrame: Array<Set<number>> = Array.from({ length: duration }, () => new Set<number>());
  localStamps.forEach(([start, tab, length]) => {
    const midi = getTabMidi(snapshot, tab);
    for (let frame = Math.max(0, start); frame < Math.min(start + length, duration); frame += 1) {
      midiAtFrame[frame].add(midi);
    }
  });
  const averages = interpolateMissing(
    midiAtFrame.map((midis) =>
      midis.size ? [...midis].reduce((sum, midi) => sum + midi, 0) / midis.size : null
    )
  );
  const kernel = Array.from({ length: 2 * BACKEND_BLUR_SIZE + 1 }, () => 1 / (2 * BACKEND_BLUR_SIZE + 1));
  const smoothed = convolveReflect(averages, kernel);
  const derivative = convolveReflect(smoothed, [-1, 0, 1]);
  const cutPositions = mergeTransitionSegments([
    ...findSignedSegments(derivative, true),
    ...findSignedSegments(derivative, false),
  ].filter(([start, end]) => Math.abs(smoothed[end] - smoothed[start]) > BACKEND_CUT_MARGIN));
  const boundaries = cutPositions
    .map(([start, end]) => Math.max(1, Math.min(duration - 1, bankersRound((start + end) / 2))))
    .filter((boundary, index, values) => index === 0 || boundary !== values[index - 1]);
  const ranges: SignedSegment[] = boundaries.length
    ? [0, ...boundaries, duration].slice(1).map((end, index, values): SignedSegment => [
        index === 0 ? 0 : values[index - 1],
        end,
      ])
    : [[0, duration]];
  const fretCount = getMaxFretFromSnapshot(snapshot) + 1;
  const openStrings = getOpenStringMidiFromSnapshot(snapshot);
  const regionData = ranges.flatMap(([rawStart, rawEnd]) => {
    const start = Math.max(0, Math.trunc(rawStart));
    const end = Math.min(duration, Math.trunc(rawEnd));
    if (end <= start) return [];
    const regionMidis = [...new Set(
      localStamps
        .filter(([time, , length]) => time < end && start < time + length)
        .map(([, tab]) => getTabMidi(snapshot, tab))
    )].sort((a, b) => a - b);
    return [{
      start,
      end,
      centerFret: regionMidis.length
        ? squareOptimizer(regionMidis, openStrings, fretCount)
        : null,
    }];
  });

  return regionData.map(({ start, end, centerFret }, index): CutWithCoord => {
    let resolvedCenter = centerFret;
    if (resolvedCenter === null) {
      let previousIndex = index - 1;
      while (previousIndex >= 0 && regionData[previousIndex].centerFret === null) previousIndex -= 1;
      let nextIndex = index + 1;
      while (nextIndex < regionData.length && regionData[nextIndex].centerFret === null) nextIndex += 1;
      const previous = previousIndex >= 0 ? regionData[previousIndex] : null;
      const next = nextIndex < regionData.length ? regionData[nextIndex] : null;
      resolvedCenter = previous?.centerFret ?? next?.centerFret ?? 0;
    }
    return [
      [start + windowStart, end + windowStart],
      [backendAnchorString(openStrings.length), resolvedCenter ?? 0],
    ];
  });
};

const normalizeGeneratedRegions = (regions: CutWithCoord[], endTime: number) => {
  const cleaned = regions
    .map(([[rawStart, rawEnd], coord]): CutWithCoord => {
      const start = Math.trunc(rawStart);
      const end = Math.trunc(rawEnd);
      return [[Math.min(start, end), Math.max(start, end)], [...coord] as TabCoord];
    })
    .sort((left, right) => left[0][0] - right[0][0]);
  const nonOverlapping: CutWithCoord[] = [];
  cleaned.forEach(([[start, end], coord]) => {
    if (end <= start) return;
    const previous = nonOverlapping[nonOverlapping.length - 1];
    if (previous && start < previous[0][1]) {
      previous[0][1] = Math.max(previous[0][1], end);
    } else {
      nonOverlapping.push([[start, end], coord]);
    }
  });
  if (!nonOverlapping.length) return [[[0, endTime], [2, 0]]] as CutWithCoord[];
  if (nonOverlapping[0][0][0] > 0) {
    nonOverlapping.unshift([[0, nonOverlapping[0][0][0]], [...nonOverlapping[0][1]] as TabCoord]);
  }
  const contiguous: CutWithCoord[] = [];
  let cursor = 0;
  nonOverlapping.forEach(([[start, end], coord]) => {
    if (cursor >= endTime || end <= 0) return;
    if (start > cursor) {
      contiguous.push([[cursor, start], [...(contiguous[contiguous.length - 1]?.[1] ?? coord)] as TabCoord]);
    }
    const safeStart = Math.max(start, cursor);
    const safeEnd = Math.max(end, safeStart);
    if (safeStart < endTime && safeEnd > safeStart) {
      contiguous.push([[safeStart, Math.min(safeEnd, endTime)], [...coord] as TabCoord]);
      cursor = contiguous[contiguous.length - 1][0][1];
    }
  });
  if (!contiguous.length) contiguous.push([[0, endTime], [2, 0]]);
  else if (contiguous[contiguous.length - 1][0][1] < endTime) {
    contiguous.push([
      [contiguous[contiguous.length - 1][0][1], endTime],
      [...contiguous[contiguous.length - 1][1]] as TabCoord,
    ]);
  }
  const collapsed: CutWithCoord[] = [];
  contiguous.forEach((region) => {
    const previous = collapsed[collapsed.length - 1];
    if (previous && previous[1][0] === region[1][0] && previous[1][1] === region[1][1]) {
      previous[0][1] = Math.max(previous[0][1], region[0][1]);
    } else {
      collapsed.push(region);
    }
  });
  return collapsed;
};

/** Frontend port of TabEditor.generateCutPositions with non-overlapping transition partitioning. */
export const generatePlayingCoordinatesInSnapshot = (snapshot: EditorSnapshot) => {
  const framesPerBar = Math.max(1, Math.trunc(snapshot.framesPerMessure || 480));
  const noteEnd = snapshot.notes.reduce(
    (latest, note) => Math.max(latest, Math.trunc(note.startTime) + Math.trunc(note.length)),
    0
  );
  const chordEnd = snapshot.chords.reduce(
    (latest, chord) => Math.max(latest, Math.trunc(chord.startTime) + Math.trunc(chord.length)),
    0
  );
  const rawEndTime = Math.max(framesPerBar, Math.trunc(snapshot.totalFrames || 0), noteEnd, chordEnd);
  const endTime = Math.ceil(rawEndTime / framesPerBar) * framesPerBar;
  snapshot.totalFrames = Math.max(Math.trunc(snapshot.totalFrames || 0), endTime);
  const maxFret = getMaxFretFromSnapshot(snapshot);
  const stringCount = getOpenStringMidiFromSnapshot(snapshot).length;
  const stamps: Stamp[] = snapshot.notes.flatMap((note): Stamp[] => {
    const stringIndex = Math.trunc(note.tab?.[0]);
    const fret = Math.max(0, Math.min(maxFret, Math.trunc(note.tab?.[1])));
    const length = Math.trunc(note.length);
    return stringIndex >= 0 && stringIndex < stringCount && length > 0
      ? [[Math.trunc(note.startTime), [stringIndex, fret], length]]
      : [];
  });
  if (!stamps.length) {
    snapshot.cutPositionsWithCoords = [[[0, Math.max(0, endTime)], [backendAnchorString(stringCount), 0]]];
    snapshot.notes.forEach((note) => { note.optimals = []; });
    return snapshot.cutPositionsWithCoords;
  }
  const chunkFrames = framesPerBar * BACKEND_BARS_PER_CHUNK;
  const regions: CutWithCoord[] = [];
  for (let start = 0; start < endTime; start += chunkFrames) {
    regions.push(...buildWindowRegions(snapshot, stamps, start, Math.min(endTime, start + chunkFrames)));
  }
  snapshot.cutPositionsWithCoords = normalizeGeneratedRegions(regions, endTime);
  assignBackendStyleOptimals(snapshot);
  return snapshot.cutPositionsWithCoords;
};
