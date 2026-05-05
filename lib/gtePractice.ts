export type PracticeLoopRange = {
  startFrame: number;
  endFrame: number;
};

export type MetronomeClick = {
  frame: number;
  timeSec: number;
  accent: boolean;
};

export const PLAYBACK_SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5] as const;
export const SPEED_TRAINER_TARGET_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export const SPEED_TRAINER_STEP_OPTIONS = [0.05, 0.1, 0.25] as const;
export const SPEED_TRAINER_STEP = 0.05;
export const SPEED_TRAINER_TARGET = 1.5;

export const normalizePlaybackSpeed = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.max(0.25, Math.min(2, parsed));
};

export const frameDeltaToSeconds = (frames: number, fps: number, playbackSpeed: number) => {
  const safeFrames = Math.max(0, Number(frames) || 0);
  const safeFps = Math.max(1, Number(fps) || 1);
  const safeSpeed = normalizePlaybackSpeed(playbackSpeed);
  return safeFrames / (safeFps * safeSpeed);
};

export const nextSpeedTrainerValue = (
  currentSpeed: number,
  step: number = SPEED_TRAINER_STEP,
  target: number = SPEED_TRAINER_TARGET
) => {
  const current = normalizePlaybackSpeed(currentSpeed);
  const safeStep = Math.max(0.01, Number(step) || SPEED_TRAINER_STEP);
  const safeTarget = normalizePlaybackSpeed(target);
  return Math.min(safeTarget, Math.round((current + safeStep) * 100) / 100);
};

export const normalizeTrackPan = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-1, Math.min(1, parsed));
};

export const equalPowerPanGains = (pan: unknown) => {
  const normalized = normalizeTrackPan(pan);
  const angle = ((normalized + 1) * Math.PI) / 4;
  return {
    leftGain: Math.cos(angle),
    rightGain: Math.sin(angle),
  };
};

export const resolvePracticeLoopRange = (
  selectedBarIndices: number[] | null | undefined,
  framesPerBar: number,
  timelineEnd: number
): PracticeLoopRange | null => {
  const safeFramesPerBar = Math.max(1, Math.round(Number(framesPerBar) || 1));
  const safeTimelineEnd = Math.max(0, Math.round(Number(timelineEnd) || 0));
  const indexes = Array.isArray(selectedBarIndices)
    ? selectedBarIndices
        .map((value) => Math.round(Number(value)))
        .filter((value) => Number.isFinite(value) && value >= 0)
    : [];
  if (!indexes.length || safeTimelineEnd <= 0) return null;

  const startBar = Math.min(...indexes);
  const endBar = Math.max(...indexes) + 1;
  const startFrame = Math.max(0, Math.min(safeTimelineEnd, startBar * safeFramesPerBar));
  const endFrame = Math.max(
    startFrame,
    Math.min(safeTimelineEnd, endBar * safeFramesPerBar)
  );
  if (endFrame <= startFrame) return null;
  return { startFrame, endFrame };
};

export const buildMetronomeClicks = (input: {
  startFrame: number;
  endFrame: number;
  framesPerBar: number;
  beatsPerBar: number;
  fps: number;
  playbackSpeed: number;
  countInBars?: number;
}) => {
  const startFrame = Math.max(0, Math.round(input.startFrame));
  const endFrame = Math.max(startFrame, Math.round(input.endFrame));
  const framesPerBar = Math.max(1, Math.round(input.framesPerBar));
  const beatsPerBar = Math.max(1, Math.min(64, Math.round(input.beatsPerBar)));
  const beatFrames = framesPerBar / beatsPerBar;
  const countInBars = Math.max(0, Math.round(input.countInBars || 0));
  const countInStart = startFrame - countInBars * framesPerBar;
  const firstBeatIndex = Math.ceil(countInStart / beatFrames);
  const lastBeatIndex = Math.floor((endFrame - 1) / beatFrames);
  const clicks: MetronomeClick[] = [];

  for (let beatIndex = firstBeatIndex; beatIndex <= lastBeatIndex; beatIndex += 1) {
    const frame = Math.round(beatIndex * beatFrames);
    if (frame < countInStart || frame >= endFrame) continue;
    const beatInBar = ((beatIndex % beatsPerBar) + beatsPerBar) % beatsPerBar;
    clicks.push({
      frame,
      timeSec:
        frame >= startFrame
          ? frameDeltaToSeconds(frame - startFrame, input.fps, input.playbackSpeed)
          : -frameDeltaToSeconds(startFrame - frame, input.fps, input.playbackSpeed),
      accent: beatInBar === 0,
    });
  }

  return clicks;
};
