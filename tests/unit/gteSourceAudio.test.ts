import { describe, expect, it } from "vitest";
import { frameForSourceAudioSeconds, sourceAudioSecondsForFrame } from "../../lib/gteSourceAudio";
import { synthesizeTimingMap } from "../../lib/gteTiming";

describe("source audio timeline conversion", () => {
  it("round-trips frames from an appended import anchor with a manual clip offset", () => {
    const timingMap = synthesizeTimingMap(2, 1_440);
    const sourceSeconds = sourceAudioSecondsForFrame(timingMap, 720, 480, 0.125);
    expect(sourceSeconds).toBeCloseTo(1.125, 6);
    expect(frameForSourceAudioSeconds(timingMap, sourceSeconds, 480, 0.125)).toBe(720);
  });

  it("never seeks before the attached audio starts", () => {
    const timingMap = synthesizeTimingMap(2, 960);
    expect(sourceAudioSecondsForFrame(timingMap, 0, 480, -1)).toBe(0);
    expect(frameForSourceAudioSeconds(timingMap, 0, 480, 0)).toBe(480);
  });
});
