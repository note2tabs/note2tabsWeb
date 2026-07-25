export type DiscreteSlideStep = {
  midi: number;
  startFrame: number;
  durationFrames: number;
  gainMultiplier: number;
};

type DiscreteSlideInput = {
  sourceMidi: number;
  targetMidi: number;
  slideStartFrame: number;
  targetStartFrame: number;
};

export const DISCRETE_SLIDE_TARGET_GAIN_MULTIPLIER = 0.35;

export const getDiscreteSlideGainMultiplier = (
  step: number,
  distance: number
) => {
  const safeDistance = Math.max(1, Math.abs(Math.round(distance)));
  const progress = Math.max(0, Math.min(1, Number(step) / safeDistance));
  return 1 - (1 - DISCRETE_SLIDE_TARGET_GAIN_MULTIPLIER) * progress;
};

/** Returns every chromatic pitch strictly between the slide endpoints. */
export const buildDiscreteSlideSteps = ({
  sourceMidi,
  targetMidi,
  slideStartFrame,
  targetStartFrame,
}: DiscreteSlideInput): DiscreteSlideStep[] => {
  const source = Math.round(sourceMidi);
  const target = Math.round(targetMidi);
  const distance = Math.abs(target - source);
  const availableFrames = targetStartFrame - slideStartFrame;
  if (distance <= 1 || availableFrames <= 0) return [];

  const direction = target > source ? 1 : -1;
  const spacing = availableFrames / distance;
  return Array.from({ length: distance - 1 }, (_, index) => {
    const step = index + 1;
    const startFrame = slideStartFrame + spacing * step;
    const nextFrame = slideStartFrame + spacing * (step + 1);
    return {
      midi: source + direction * step,
      startFrame,
      durationFrames: Math.max(1, nextFrame - startFrame),
      // A guitar slide loses energy as the finger travels. Keep the first
      // transition audible, then fade each following chromatic step.
      gainMultiplier: getDiscreteSlideGainMultiplier(step, distance),
    };
  });
};
