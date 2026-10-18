import { describe, expect, it } from "vitest";
import { estimateChordName } from "../../lib/gteChordName";
import { getTabMidi } from "../../lib/gteTuning";

describe("probabilistic chord-name estimation", () => {
  it.each([
    [[48, 52, 55], "C"],
    [[57, 60, 64], "Am"],
    [[43, 47, 50, 53], "G7"],
    [[48, 52, 55, 59], "Cmaj7"],
    [[57, 60, 64, 67], "Am7"],
    [[48, 52, 55, 62], "Cadd9"],
    [[48, 52, 55, 58, 62], "C9"],
    [[48, 53, 55], "Csus4"],
    [[48, 50, 55], "Csus2"],
    [[48, 51, 54], "Cdim"],
    [[48, 52, 56], "Caug"],
    [[40, 47, 52], "E5"],
    [[52, 55, 60], "C/E"],
    [[55, 60, 64], "C/G"],
  ] as Array<[number[], string]>)("names %j as %s", (midis, label) => {
    const result = estimateChordName(midis)!;
    expect(result.label).toBe(label);
    expect(result.probability).toBeGreaterThan(0);
    expect(result.probability).toBeLessThanOrEqual(1);
    expect(result.alternatives[0].label).toBe(label);
  });
  it("uses the bass to distinguish equivalent C6 and Am7 pitch sets", () => {
    expect(estimateChordName([48, 52, 55, 57])?.label).toBe("C6");
    expect(estimateChordName([45, 48, 52, 55])?.label).toBe("Am7");
  });
  it("is invariant to input order and octave doubling", () => {
    const input = [48, 52, 55];
    const saved = [...input];
    expect(estimateChordName([55, 52, 48])).toEqual(estimateChordName(input));
    expect(estimateChordName([48, 52, 55, 60, 64, 67])).toEqual(estimateChordName(input));
    expect(input).toEqual(saved);
  });
  it("returns no name for insufficient or invalid input", () => {
    for (const input of [[], [60], [48, 60], [48, 52], [NaN, Infinity, -1, 128]]) expect(estimateChordName(input)).toBeNull();
  });
  it("tolerates an omitted fifth in a seventh chord", () => {
    expect(estimateChordName([48, 52, 58])?.label).toBe("C7");
  });
  it("updates from actual tabs when a member's pitch changes", () => {
    const tuning = { tuning: { presetId: "custom", openStringMidi: [64, 59, 55, 50, 45, 40], capo: 0 } };
    const tabs: [number, number][] = [[4, 3], [3, 2], [2, 0]];
    expect(estimateChordName(tabs.map((tab) => getTabMidi(tuning, tab)))?.label).toBe("C");
    tabs[1][1] = 1;
    expect(estimateChordName(tabs.map((tab) => getTabMidi(tuning, tab)))?.label).toBe("Cm");
    tuning.tuning.capo = 2;
    expect(estimateChordName(tabs.map((tab) => getTabMidi(tuning, tab)))?.label).toBe("Dm");
  });
});
