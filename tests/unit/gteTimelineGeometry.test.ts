import { describe, expect, it } from "vitest";
import {
  GTE_TIMELINE_COLUMN_GAP,
  GTE_TIMELINE_GUTTER_WIDTH,
  GTE_TIMELINE_LABEL_COLUMN_WIDTH,
  getScaledDrumHitSize,
  getTimelineBaseScale,
} from "../../lib/gteTimelineGeometry";

describe("gte timeline geometry", () => {
  it("aligns the external tab labels with the internal track gutter", () => {
    expect(GTE_TIMELINE_LABEL_COLUMN_WIDTH + GTE_TIMELINE_COLUMN_GAP).toBe(
      GTE_TIMELINE_GUTTER_WIDTH
    );
  });

  it("keeps drum hits inside wide and narrow scaled grid cells", () => {
    expect(getScaledDrumHitSize(40, 28)).toBe(24);
    expect(getScaledDrumHitSize(10, 28)).toBe(8);
    expect(getScaledDrumHitSize(0.5, 28)).toBeLessThanOrEqual(0.5);
  });

  it("sizes bars from the requested row capacity when a song has fewer bars", () => {
    const scale = getTimelineBaseScale(960, 480, 4);

    expect(scale).toBe(0.5);
    expect(2 * 480 * scale).toBe(480);
  });
});
