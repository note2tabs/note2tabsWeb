import type { CanvasSnapshot, TimingAnchor, TimingBar, TimingMapV2 } from "../types/gte";

export const GTE_FRAMES_PER_BAR = 480 as const;
export const DEFAULT_GTE_SECONDS_PER_BAR = 2;

const finite = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clampInt = (value: unknown, fallback: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, Math.round(finite(value, fallback))));

const eventEndFrame = (canvas: Pick<CanvasSnapshot, "editors">) =>
  canvas.editors.reduce<number>((latest, lane) => {
    const events = [...(lane.notes || []), ...(lane.chords || [])];
    const latestEvent = events.reduce(
      (laneLatest, event) =>
        Math.max(
          laneLatest,
          Math.max(0, Math.round(finite(event.startTime, 0))) +
            Math.max(1, Math.round(finite(event.length, 1)))
        ),
      0
    );
    return Math.max(latest, latestEvent, Math.max(GTE_FRAMES_PER_BAR, Math.round(finite(lane.totalFrames, 0))));
  }, GTE_FRAMES_PER_BAR);

const uniformBar = (
  index: number,
  startSeconds: number,
  secondsPerBar: number,
  numerator: number,
  denominator: number
): TimingBar => ({
  id: `bar-${index + 1}`,
  index,
  startFrame: index * GTE_FRAMES_PER_BAR,
  endFrame: (index + 1) * GTE_FRAMES_PER_BAR,
  startSeconds,
  endSeconds: startSeconds + secondsPerBar,
  quarterNoteBpm: (60 * numerator * (4 / denominator)) / secondsPerBar,
  timeSignature: { numerator, denominator },
  anchors: [],
  confidence: 1,
  source: "legacy",
});

export const synthesizeTimingMap = (
  secondsPerBar: unknown,
  totalFrames: unknown,
  numerator: unknown = 4,
  denominator: unknown = 4
): TimingMapV2 => {
  const duration = Math.max(0.1, finite(secondsPerBar, DEFAULT_GTE_SECONDS_PER_BAR));
  const bars = Math.max(1, Math.ceil(Math.max(GTE_FRAMES_PER_BAR, finite(totalFrames, 0)) / GTE_FRAMES_PER_BAR));
  const beats = clampInt(numerator, 4, 1, 64);
  const beatType = clampInt(denominator, 4, 1, 64);
  return {
    version: 2,
    framesPerBar: GTE_FRAMES_PER_BAR,
    audioOffsetSeconds: 0,
    bars: Array.from({ length: bars }, (_, index) =>
      uniformBar(index, index * duration, duration, beats, beatType)
    ),
  };
};

export const normalizeTimingMap = (
  raw: CanvasSnapshot["timingMap"],
  fallback: {
    secondsPerBar?: unknown;
    totalFrames?: unknown;
    numerator?: unknown;
    denominator?: unknown;
  } = {}
): TimingMapV2 => {
  const fallbackMap = synthesizeTimingMap(
    fallback.secondsPerBar,
    fallback.totalFrames,
    fallback.numerator,
    fallback.denominator
  );
  if (!raw || !Array.isArray(raw.bars) || raw.bars.length === 0) return fallbackMap;

  const bars: TimingBar[] = [];
  let cursorSeconds = 0;
  let previousDuration = Math.max(0.1, finite(fallback.secondsPerBar, DEFAULT_GTE_SECONDS_PER_BAR));
  const rawByIndex = new Map(
    raw.bars.map((bar, index) => [Math.max(0, Math.round(finite(bar?.index, index))), bar] as const)
  );
  const requestedCount = Math.max(
    fallbackMap.bars.length,
    ...Array.from(rawByIndex.keys(), (index) => index + 1)
  );
  for (let index = 0; index < requestedCount; index += 1) {
    const source = rawByIndex.get(index);
    if (!source) {
      const inherited = uniformBar(index, cursorSeconds, previousDuration, 4, 4);
      bars.push(inherited);
      cursorSeconds = inherited.endSeconds;
      continue;
    }
    const numerator = clampInt(source.timeSignature?.numerator, 4, 1, 64);
    const denominator = clampInt(source.timeSignature?.denominator, 4, 1, 64);
    const requestedStart = finite(source.startSeconds, cursorSeconds);
    const startSeconds = Math.abs(requestedStart - cursorSeconds) <= 0.05 ? requestedStart : cursorSeconds;
    const requestedEnd = finite(source.endSeconds, startSeconds + previousDuration);
    const duration = Math.max(0.1, requestedEnd - startSeconds || previousDuration);
    const anchors = (Array.isArray(source.anchors) ? source.anchors : [])
      .map((anchor): TimingAnchor | null => {
        const tick = clampInt(anchor?.tick, 0, 0, GTE_FRAMES_PER_BAR);
        const seconds = finite(anchor?.seconds, Number.NaN);
        return Number.isFinite(seconds) && seconds >= startSeconds && seconds <= startSeconds + duration
          ? { tick, seconds }
          : null;
      })
      .filter((anchor): anchor is TimingAnchor => Boolean(anchor))
      .sort((left, right) => left.tick - right.tick || left.seconds - right.seconds);
    const bar = uniformBar(index, startSeconds, duration, numerator, denominator);
    bar.id = String(source.id || bar.id);
    bar.quarterNoteBpm = Math.max(1, finite(source.quarterNoteBpm, bar.quarterNoteBpm));
    bar.anchors = anchors;
    bar.confidence = Math.max(0, Math.min(1, finite(source.confidence, 1)));
    bar.source = String(source.source || "manual");
    bars.push(bar);
    cursorSeconds = bar.endSeconds;
    previousDuration = duration;
  }
  return {
    version: 2,
    framesPerBar: GTE_FRAMES_PER_BAR,
    audioOffsetSeconds: finite(raw.audioOffsetSeconds, 0),
    bars,
  };
};

export const timingMapForCanvas = (canvas: CanvasSnapshot): TimingMapV2 => {
  const first = canvas.editors[0];
  return normalizeTimingMap(canvas.timingMap, {
    secondsPerBar: canvas.secondsPerBar,
    totalFrames: eventEndFrame(canvas),
    numerator: first?.timeSignature,
    denominator: first?.timeSignatureBottom,
  });
};

export type TimingBpmSegment = {
  startBarIndex: number;
  endBarIndex: number;
  bpm: number;
};

export const formatTimingBpm = (value: unknown) => {
  const bpm = Math.max(1, finite(value, 1));
  return String(Math.round(bpm * 100) / 100);
};

export const getTimingBarBpm = (
  timingMap: TimingMapV2 | undefined,
  barIndex: number,
  fallbackBpm: number
) => {
  const mappedBpm = timingMap?.bars[barIndex]?.quarterNoteBpm;
  return Math.max(1, finite(mappedBpm, fallbackBpm));
};

export const buildTimingBpmSegments = (
  timingMap: TimingMapV2 | undefined,
  barIndexes: number[],
  fallbackBpm: number
): TimingBpmSegment[] => {
  const indexes = Array.from(
    new Set(
      barIndexes
        .map((index) => Math.round(Number(index)))
        .filter((index) => Number.isFinite(index) && index >= 0)
    )
  ).sort((left, right) => left - right);

  return indexes.reduce<TimingBpmSegment[]>((segments, barIndex) => {
    const bpm = getTimingBarBpm(timingMap, barIndex, fallbackBpm);
    const previous = segments[segments.length - 1];
    if (
      previous &&
      previous.endBarIndex + 1 === barIndex &&
      formatTimingBpm(previous.bpm) === formatTimingBpm(bpm)
    ) {
      previous.endBarIndex = barIndex;
      return segments;
    }
    segments.push({ startBarIndex: barIndex, endBarIndex: barIndex, bpm });
    return segments;
  }, []);
};

type TimingPoint = { frame: number; seconds: number };

const pointsForBar = (bar: TimingBar): TimingPoint[] => {
  const points = [
    { frame: bar.startFrame, seconds: bar.startSeconds },
    ...bar.anchors.map((anchor) => ({ frame: bar.startFrame + anchor.tick, seconds: anchor.seconds })),
    { frame: bar.endFrame, seconds: bar.endSeconds },
  ].sort((left, right) => left.frame - right.frame || left.seconds - right.seconds);
  return points.filter(
    (point, index) =>
      index === 0 ||
      point.frame !== points[index - 1].frame ||
      point.seconds !== points[index - 1].seconds
  );
};

export const frameToSeconds = (timingMap: TimingMapV2, frame: unknown) => {
  const safeFrame = Math.max(0, finite(frame, 0));
  const index = Math.min(
    timingMap.bars.length - 1,
    Math.max(0, Math.floor(safeFrame / GTE_FRAMES_PER_BAR))
  );
  const points = pointsForBar(timingMap.bars[index]);
  let left = points[0];
  let right = points[points.length - 1];
  for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
    if (safeFrame <= points[pointIndex].frame) {
      left = points[pointIndex - 1];
      right = points[pointIndex];
      break;
    }
  }
  const span = Math.max(Number.EPSILON, right.frame - left.frame);
  return (
    left.seconds + ((safeFrame - left.frame) / span) * (right.seconds - left.seconds) +
    timingMap.audioOffsetSeconds
  );
};

export const secondsToFrame = (timingMap: TimingMapV2, seconds: unknown) => {
  const safeSeconds = Math.max(0, finite(seconds, 0) - timingMap.audioOffsetSeconds);
  const bar =
    timingMap.bars.find((candidate) => safeSeconds < candidate.endSeconds) ||
    timingMap.bars[timingMap.bars.length - 1];
  const points = pointsForBar(bar).sort(
    (left, right) => left.seconds - right.seconds || left.frame - right.frame
  );
  let left = points[0];
  let right = points[points.length - 1];
  for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
    if (safeSeconds <= points[pointIndex].seconds) {
      left = points[pointIndex - 1];
      right = points[pointIndex];
      break;
    }
  }
  const span = Math.max(Number.EPSILON, right.seconds - left.seconds);
  return Math.max(
    0,
    Math.round(left.frame + ((safeSeconds - left.seconds) / span) * (right.frame - left.frame))
  );
};

export const frameDurationSeconds = (
  timingMap: TimingMapV2,
  startFrame: unknown,
  endFrame: unknown
) => Math.max(0, frameToSeconds(timingMap, endFrame) - frameToSeconds(timingMap, startFrame));

export type TimingMapMetronomeClick = {
  frame: number;
  timeSec: number;
  accent: boolean;
  countIn: boolean;
};

export const buildTimingMapMetronomeClicks = (options: {
  timingMap: TimingMapV2;
  startFrame: number;
  endFrame: number;
  playbackSpeed?: number;
  countInBars?: number;
}): TimingMapMetronomeClick[] => {
  const speed = Math.max(0.1, finite(options.playbackSpeed, 1));
  const startFrame = Math.max(0, finite(options.startFrame, 0));
  const endFrame = Math.max(startFrame, finite(options.endFrame, startFrame));
  const startSeconds = frameToSeconds(options.timingMap, startFrame);
  const clicks: TimingMapMetronomeClick[] = [];

  options.timingMap.bars.forEach((bar) => {
    const beats = clampInt(bar.timeSignature.numerator, 4, 1, 64);
    for (let beat = 0; beat < beats; beat += 1) {
      const frame = bar.startFrame + (beat * GTE_FRAMES_PER_BAR) / beats;
      if (frame < startFrame || frame >= endFrame) continue;
      clicks.push({
        frame,
        timeSec: (frameToSeconds(options.timingMap, frame) - startSeconds) / speed,
        accent: beat === 0,
        countIn: false,
      });
    }
  });

  const countInBars = Math.max(0, Math.round(finite(options.countInBars, 0)));
  if (countInBars > 0) {
    const startBar =
      options.timingMap.bars[
        Math.min(
          options.timingMap.bars.length - 1,
          Math.max(0, Math.floor(startFrame / GTE_FRAMES_PER_BAR))
        )
      ];
    const beats = clampInt(startBar.timeSignature.numerator, 4, 1, 64);
    const barDuration = Math.max(0.1, startBar.endSeconds - startBar.startSeconds) / speed;
    const beatDuration = barDuration / beats;
    for (let bar = 0; bar < countInBars; bar += 1) {
      for (let beat = 0; beat < beats; beat += 1) {
        const remainingBars = countInBars - bar;
        clicks.push({
          frame: startFrame,
          timeSec: -(remainingBars * barDuration) + beat * beatDuration,
          accent: beat === 0,
          countIn: true,
        });
      }
    }
  }

  return clicks.sort((left, right) => left.timeSec - right.timeSec || Number(right.accent) - Number(left.accent));
};
