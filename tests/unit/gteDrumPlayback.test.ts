import { expect, it, vi } from "vitest";
import { DRUM_SAMPLE_GAINS, schedulePreparedDrumHit } from "../../lib/gteDrumPlayback";
import { DRUM_VOICES } from "../../lib/gteDrums";

it("applies balanced sample gain to every drum voice", () => {
  for (const voiceId of DRUM_VOICES.map(voice => voice.id)) {
    const setValueAtTime = vi.fn();
    const start = vi.fn();
    const ctx = {
      currentTime: 2,
      createBufferSource: () => ({ connect: vi.fn(), start }),
      createGain: () => ({ gain: { setValueAtTime }, connect: vi.fn() }),
    } as unknown as AudioContext;
    schedulePreparedDrumHit({ ctx, destination: {} as AudioNode,
      kit: new Map([[voiceId, {} as AudioBuffer]]), voiceId, gain: 0.7, startTime: 3 });
    expect(DRUM_SAMPLE_GAINS[voiceId]).toBeGreaterThan(0);
    expect(DRUM_SAMPLE_GAINS[voiceId]).toBeLessThanOrEqual(1);
    expect(setValueAtTime).toHaveBeenCalledWith(0.7 * DRUM_SAMPLE_GAINS[voiceId], 3);
    expect(start).toHaveBeenCalledWith(3);
  }
});
