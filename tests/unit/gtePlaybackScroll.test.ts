import { describe, expect, it } from "vitest";
import { getPlaybackScrollTarget } from "../../lib/gtePlaybackScroll";

describe("getPlaybackScrollTarget", () => {
  it("jumps to the playhead anchor and clamps at both timeline edges", () => {
    expect(getPlaybackScrollTarget({ playheadLeft: 100, maxScroll: 2000, visibleStartInContainer: 0, visibleWidth: 1000 })).toBe(0);
    expect(getPlaybackScrollTarget({ playheadLeft: 900, maxScroll: 2000, visibleStartInContainer: 0, visibleWidth: 1000 })).toBe(450);
    expect(getPlaybackScrollTarget({ playheadLeft: 4000, maxScroll: 2000, visibleStartInContainer: 0, visibleWidth: 1000 })).toBe(2000);
  });
});
