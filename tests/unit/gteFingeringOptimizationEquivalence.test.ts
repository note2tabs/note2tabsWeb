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

// Updated for the intentionally more sensitive 4.5-semitone cut threshold.
const BASELINE_TWO_PASS_HASH = "7618e4fffe169489bbbf0810a20eb1f48a6ad1805ca26af23ac7974e90a449f0";

const runCompletePass = (snapshot: EditorSnapshot) => {
  generatePlayingCoordinatesInSnapshot(snapshot);
  optimizeTrackFingeringInSnapshot(snapshot);
  finalizeOptimizedTrackFingeringInSnapshot(snapshot);
  mergeRedundantCutRegionsInSnapshot(snapshot);
};

describe("optimized fingering implementation equivalence", () => {
  it("matches the coordinate-generation baseline byte-for-byte after two transcription passes", () => {
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
