import { describe, expect, it } from "vitest";
import { buildChordPlaybackWindows } from "../../lib/gteChordPlayback";

describe("chord playback windows", () => {
  it("caps a long chord at one bar", () => {
    expect(
      buildChordPlaybackWindows({
        chordStart: 100,
        chordLength: 960,
        maxRingFrames: 480,
      })
    ).toEqual([
      { time: 0, direction: "down", startFrame: 100, endFrame: 580 },
    ]);
  });

  it("rings until the chord box ends when it is shorter than one bar", () => {
    expect(
      buildChordPlaybackWindows({
        chordStart: 40,
        chordLength: 300,
        maxRingFrames: 480,
      })[0]
    ).toMatchObject({ startFrame: 40, endFrame: 340 });
  });

  it("cuts each strum off at the next strum", () => {
    expect(
      buildChordPlaybackWindows({
        chordStart: 0,
        chordLength: 960,
        maxRingFrames: 480,
        strums: [
          { time: 0, direction: "down" },
          { time: 120, direction: "up" },
          { time: 700, direction: "down" },
        ],
      }).map(({ direction, startFrame, endFrame }) => ({ direction, startFrame, endFrame }))
    ).toEqual([
      { direction: "down", startFrame: 0, endFrame: 120 },
      { direction: "up", startFrame: 120, endFrame: 600 },
      { direction: "down", startFrame: 700, endFrame: 960 },
    ]);
  });

  it("uses mute strums as ringing cutoffs", () => {
    expect(
      buildChordPlaybackWindows({
        chordStart: 0,
        chordLength: 480,
        maxRingFrames: 480,
        strums: [
          { time: 0, direction: "down" },
          { time: 180, direction: "mute" },
        ],
      })
    ).toEqual([
      { time: 0, direction: "down", startFrame: 0, endFrame: 180 },
      { time: 180, direction: "mute", startFrame: 180, endFrame: 480 },
    ]);
  });
});
