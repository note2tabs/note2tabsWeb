export type DiscreteSlideStep = {
  midi: number;
  startFrame: number;
  durationFrames: number;
};

type DiscreteSlideInput = {
  sourceMidi: number;
  targetMidi: number;
  slideStartFrame: number;
  targetStartFrame: number;
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
    };
  });
};
