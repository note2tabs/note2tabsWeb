import { describe, expect, it } from "vitest";
import {
  GTE_TIMELINE_COLUMN_GAP,
  GTE_TIMELINE_GUTTER_WIDTH,
  GTE_TIMELINE_LABEL_COLUMN_WIDTH,
  getScaledDrumHitSize,
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
});
