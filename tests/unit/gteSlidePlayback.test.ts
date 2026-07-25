import { describe, expect, it } from "vitest";
import { buildDiscreteSlideSteps } from "../../lib/gteSlidePlayback";

describe("discrete slide playback", () => {
  it("creates every ascending semitone evenly between the endpoint notes", () => {
    expect(
      buildDiscreteSlideSteps({
        sourceMidi: 60,
        targetMidi: 64,
        slideStartFrame: 100,
        targetStartFrame: 140,
      })
    ).toEqual([
      { midi: 61, startFrame: 110, durationFrames: 10, gainMultiplier: 0.85 },
      { midi: 62, startFrame: 120, durationFrames: 10, gainMultiplier: 0.7 },
      { midi: 63, startFrame: 130, durationFrames: 10, gainMultiplier: 0.55 },
    ]);
  });

  it("creates descending semitones and excludes both endpoints", () => {
    expect(
      buildDiscreteSlideSteps({
        sourceMidi: 65,
        targetMidi: 62,
        slideStartFrame: 20,
        targetStartFrame: 50,
      }).map((step) => [step.midi, step.startFrame])
    ).toEqual([
      [64, 30],
      [63, 40],
    ]);
  });

  it("decreases the gain at every step for ascending and descending slides", () => {
    const ascending = buildDiscreteSlideSteps({
      sourceMidi: 60,
      targetMidi: 65,
      slideStartFrame: 0,
      targetStartFrame: 50,
    });
    const descending = buildDiscreteSlideSteps({
      sourceMidi: 65,
      targetMidi: 60,
      slideStartFrame: 0,
      targetStartFrame: 50,
    });

    for (const steps of [ascending, descending]) {
      expect(steps.length).toBeGreaterThan(1);
      steps.slice(1).forEach((step, index) => {
        expect(step.gainMultiplier).toBeLessThan(steps[index].gainMultiplier);
      });
      expect(steps.every((step) => step.gainMultiplier > 0)).toBe(true);
    }
  });

  it("does not add an intermediate note for a one-semitone slide", () => {
    expect(
      buildDiscreteSlideSteps({
        sourceMidi: 60,
        targetMidi: 61,
        slideStartFrame: 0,
        targetStartFrame: 10,
      })
    ).toEqual([]);
  });
});
