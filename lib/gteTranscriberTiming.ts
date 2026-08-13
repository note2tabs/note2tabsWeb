import type { CanvasSnapshot, TimingBar, TimingMapV2 } from "../types/gte";
import { GTE_FRAMES_PER_BAR, normalizeTimingMap } from "./gteTiming";

export const MINIMUM_INTERIOR_TEMPO_SEGMENT_BARS = 10;

const finite = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const eventEnd = (canvas: CanvasSnapshot) =>
  canvas.editors.reduce<number>((latest, lane) => {
    const laneEnd = [...lane.notes, ...lane.chords].reduce(
      (end, event) => Math.max(end, finite(event.startTime, 0) + Math.max(1, finite(event.length, 1))),
      finite(lane.totalFrames, GTE_FRAMES_PER_BAR)
    );
    return Math.max(latest, laneEnd);
  }, GTE_FRAMES_PER_BAR);

const totalBarCount = (canvas: CanvasSnapshot) =>
  Math.max(1, Math.ceil(eventEnd(canvas) / GTE_FRAMES_PER_BAR));

const weightedMedian = (values: Array<{ value: number; weight: number }>, fallback: number) => {
  if (!values.length) return fallback;
  const sorted = [...values].sort((left, right) => left.value - right.value);
  const total = sorted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = 0;
  for (const item of sorted) {
    cursor += item.weight;
    if (cursor >= total / 2) return item.value;
  }
  return sorted[sorted.length - 1].value;
};

const weightedMode = (values: Array<{ value: number; weight: number }>, fallback: number) => {
  if (!values.length) return fallback;
  let best = values[0];
  let bestWeight = -1;
  values.forEach((candidate) => {
    const cluster = values.filter(
      (item) => relativeDifference(item.value, candidate.value) <= 0.03
    );
    const clusterWeight = cluster.reduce((sum, item) => sum + item.weight, 0);
    if (clusterWeight > bestWeight) {
      bestWeight = clusterWeight;
      best = { value: weightedMedian(cluster, candidate.value), weight: clusterWeight };
    }
  });
  return best.value;
};

const foldBpmNear = (bpm: number, reference: number) => {
  const candidates = [bpm / 2, bpm, bpm * 2].filter((value) => value >= 30 && value <= 320);
  return candidates.reduce((best, value) =>
    Math.abs(Math.log2(value / reference)) < Math.abs(Math.log2(best / reference)) ? value : best
  );
};

const barEvidence = (canvas: CanvasSnapshot, barCount: number) => {
  const evidence = Array.from({ length: barCount }, () => ({ onsets: 0, sounding: 0 }));
  canvas.editors.forEach((lane) => {
    [...lane.notes, ...lane.chords].forEach((event) => {
      const start = Math.max(0, finite(event.startTime, 0));
      const end = Math.max(start + 1, start + finite(event.length, 1));
      const startBar = Math.min(barCount - 1, Math.floor(start / GTE_FRAMES_PER_BAR));
      const endBar = Math.min(barCount - 1, Math.floor((end - 1) / GTE_FRAMES_PER_BAR));
      evidence[startBar].onsets += 1;
      for (let index = startBar; index <= endBar; index += 1) evidence[index].sounding += 1;
    });
  });
  return evidence;
};

const relativeDifference = (left: number, right: number) =>
  Math.abs(left - right) / Math.max(1, Math.abs(right));

const rebuildBars = (bars: TimingBar[], bpms: number[]) => {
  let cursorSeconds = 0;
  return bars.map((bar, index): TimingBar => {
    const bpm = Math.max(1, bpms[index] ?? bar.quarterNoteBpm);
    const numerator = Math.max(1, Math.round(finite(bar.timeSignature.numerator, 4)));
    const denominator = Math.max(1, Math.round(finite(bar.timeSignature.denominator, 4)));
    const quarterNotes = numerator * (4 / denominator);
    const duration = Math.max(0.1, (60 * quarterNotes) / bpm);
    const next: TimingBar = {
      ...bar,
      index,
      startFrame: index * GTE_FRAMES_PER_BAR,
      endFrame: (index + 1) * GTE_FRAMES_PER_BAR,
      startSeconds: cursorSeconds,
      endSeconds: cursorSeconds + duration,
      quarterNoteBpm: bpm,
      anchors: Array.from({ length: numerator + 1 }, (_, beat) => ({
        tick: Math.round((beat * GTE_FRAMES_PER_BAR) / numerator),
        seconds: cursorSeconds + (beat * duration) / numerator,
      })),
    };
    cursorSeconds = next.endSeconds;
    return next;
  });
};

export const stabilizeNewTranscriberTimingMap = (canvas: CanvasSnapshot): TimingMapV2 => {
  const barCount = totalBarCount(canvas);
  const map = normalizeTimingMap(canvas.timingMap, {
    secondsPerBar: canvas.secondsPerBar,
    totalFrames: barCount * GTE_FRAMES_PER_BAR,
    numerator: canvas.editors[0]?.timeSignature,
    denominator: canvas.editors[0]?.timeSignatureBottom,
  });
  const evidence = barEvidence(canvas, map.bars.length);
  const automaticBars = map.bars.filter((bar) => bar.source !== "manual");
  const initialReference = weightedMode(
    automaticBars.map((bar) => ({
      value: (() => {
        let bpm = Math.max(1, bar.quarterNoteBpm);
        while (bpm < 60) bpm *= 2;
        while (bpm > 180) bpm /= 2;
        return bpm;
      })(),
      weight: Math.max(0.1, bar.confidence) * Math.max(1, evidence[bar.index]?.onsets || 0),
    })),
    Math.max(1, map.bars[0]?.quarterNoteBpm || 120)
  );
  const folded = automaticBars.map((bar) => ({
    value: foldBpmNear(Math.max(1, bar.quarterNoteBpm), initialReference),
    weight: Math.max(0.1, bar.confidence) * Math.max(1, evidence[bar.index]?.onsets || 0),
  }));
  const dominantBpm = weightedMode(folded, initialReference);
  const candidates = map.bars.map((bar) =>
    bar.source === "manual"
      ? Math.max(1, bar.quarterNoteBpm)
      : foldBpmNear(Math.max(1, bar.quarterNoteBpm), dominantBpm)
  );
  const resolved = map.bars.map((bar, index) => {
    if (bar.source === "manual") return candidates[index];
    const activity = evidence[index];
    if (!activity || activity.sounding === 0 || relativeDifference(candidates[index], dominantBpm) <= 0.03) {
      return dominantBpm;
    }
    return candidates[index];
  });

  let index = 0;
  while (index < resolved.length) {
    if (map.bars[index].source === "manual" || relativeDifference(resolved[index], dominantBpm) <= 0.03) {
      index += 1;
      continue;
    }
    const start = index;
    const segmentBpm = resolved[index];
    while (
      index + 1 < resolved.length &&
      map.bars[index + 1].source !== "manual" &&
      relativeDifference(resolved[index + 1], segmentBpm) <= 0.03
    ) {
      index += 1;
    }
    const end = index;
    const activeBars = evidence
      .slice(start, end + 1)
      .filter((item) => item.onsets > 0).length;
    const meanConfidence =
      map.bars.slice(start, end + 1).reduce((sum, bar) => sum + Math.max(0, bar.confidence), 0) /
      Math.max(1, end - start + 1);
    const openingException = start === 0 && activeBars >= 1 && meanConfidence >= 0.55;
    const supportedChange =
      end - start + 1 >= MINIMUM_INTERIOR_TEMPO_SEGMENT_BARS &&
      activeBars >= 2 &&
      meanConfidence >= 0.55 &&
      relativeDifference(segmentBpm, dominantBpm) >= 0.04;
    if (!openingException && !supportedChange) {
      for (let barIndex = start; barIndex <= end; barIndex += 1) resolved[barIndex] = dominantBpm;
    } else {
      const stableSegmentBpm = weightedMedian(
        map.bars.slice(start, end + 1).map((bar, offset) => ({
          value: resolved[start + offset],
          weight: Math.max(0.1, bar.confidence) * Math.max(1, evidence[start + offset].onsets),
        })),
        segmentBpm
      );
      for (let barIndex = start; barIndex <= end; barIndex += 1) resolved[barIndex] = stableSegmentBpm;
    }
    index += 1;
  }

  return { ...map, bars: rebuildBars(map.bars, resolved) };
};

export const preserveExistingTimingForOffsetImport = (
  importedCanvas: CanvasSnapshot,
  existingCanvas: CanvasSnapshot
): TimingMapV2 => {
  const finalBarCount = totalBarCount(importedCanvas);
  const existingMap = normalizeTimingMap(existingCanvas.timingMap, {
    secondsPerBar: existingCanvas.secondsPerBar,
    totalFrames: eventEnd(existingCanvas),
    numerator: existingCanvas.editors[0]?.timeSignature,
    denominator: existingCanvas.editors[0]?.timeSignatureBottom,
  });
  const bars = existingMap.bars.slice(0, finalBarCount);
  const last = bars[bars.length - 1] || existingMap.bars[0];
  while (bars.length < finalBarCount) {
    const index = bars.length;
    bars.push({
      ...last,
      id: `bar-${index + 1}`,
      index,
      startFrame: index * GTE_FRAMES_PER_BAR,
      endFrame: (index + 1) * GTE_FRAMES_PER_BAR,
      source: "legacy",
      anchors: [],
    });
  }
  return { ...existingMap, bars: rebuildBars(bars, bars.map((bar) => bar.quarterNoteBpm)) };
};
