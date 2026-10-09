import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  finalizeOptimizedTrackFingeringInSnapshot,
  mergeRedundantCutRegionsInSnapshot,
  optimizeTrackFingeringInSnapshot,
} from "../../lib/gteFingeringOptimization";
import { buildGtePerformanceFixture } from "../../lib/gtePerformanceFixture";
import { generatePlayingCoordinatesInSnapshot } from "../../lib/gtePlayingCoordinates";
import type { EditorSnapshot } from "../../types/gte";

const BASELINE_TWO_PASS_HASH = "25aa9b9da5686cee8f050622815470a8a5f7742c88249044aa62053818b9ee7c";

const runCompletePass = (snapshot: EditorSnapshot) => {
  generatePlayingCoordinatesInSnapshot(snapshot);
  optimizeTrackFingeringInSnapshot(snapshot);
  finalizeOptimizedTrackFingeringInSnapshot(snapshot);
  mergeRedundantCutRegionsInSnapshot(snapshot);
};

describe("optimized fingering implementation equivalence", () => {
  it("matches the pre-optimization snapshot byte-for-byte after two transcription passes", () => {
    const lane = buildGtePerformanceFixture({ trackCount: 1, bars: 120, notesPerLane: 900 }).editors[0];
    runCompletePass(lane);
    runCompletePass(lane);
    expect(createHash("sha256").update(JSON.stringify(lane)).digest("hex"))
      .toBe(BASELINE_TWO_PASS_HASH);
  });

  it("is deterministic for identical inputs", () => {
    const source = buildGtePerformanceFixture({ trackCount: 1, bars: 20, notesPerLane: 140 }).editors[0];
    const first = structuredClone(source);
    const second = structuredClone(source);
    runCompletePass(first);
    runCompletePass(second);
    expect(second).toEqual(first);
  });
});
