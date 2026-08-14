import { describe, expect, it } from "vitest";
import { buildTrackMergePlan } from "../../lib/gteTrackMerge";

describe("buildTrackMergePlan", () => {
  const tracks = [
    { id: "one", name: "Lead" },
    { id: "two", name: "Rhythm" },
    { id: "three", name: "Bass" },
    { id: "four", name: "Drums" },
  ];

  it("orders selected tracks from top to bottom and names the merged track", () => {
    expect(buildTrackMergePlan(tracks, ["four", "two"])).toEqual({
      laneIds: ["two", "four"],
      name: "Rhythm + Drums",
      targetIndex: 1,
    });
  });

  it("supports more than two tracks and falls back for unnamed tracks", () => {
    expect(
      buildTrackMergePlan(
        [...tracks, { id: "five", name: "  " }],
        ["five", "three", "one"]
      )
    ).toEqual({
      laneIds: ["one", "three", "five"],
      name: "Lead + Bass + Untitled track",
      targetIndex: 0,
    });
  });

  it("requires at least two existing selected tracks", () => {
    expect(buildTrackMergePlan(tracks, ["one", "missing"])).toBeNull();
  });
});
