import { describe, expect, it } from "vitest";
import {
  getChordFingeringDatasetType,
  hydrateChordFingering,
} from "../../lib/gteChordFingerings";
import {
  decodeFret,
  loadChordFingerings,
} from "../../pages/api/chord-fingerings";

describe("JSON chord fingerings", () => {
  it("maps editor chord metadata to the dataset suffixes", () => {
    expect(getChordFingeringDatasetType({ quality: "major", extension: "" })).toBe("major");
    expect(getChordFingeringDatasetType({ quality: "minor", extension: "" })).toBe("minor");
    expect(getChordFingeringDatasetType({ quality: "minor", extension: "7" })).toBe("m7");
    expect(getChordFingeringDatasetType({ quality: "augmented", extension: "7" })).toBe("aug7");
  });

  it("decodes the dataset's base-36 fret notation", () => {
    expect(decodeFret("0")).toBe(0);
    expect(decodeFret("9")).toBe(9);
    expect(decodeFret("a")).toBe(10);
    expect(decodeFret("m")).toBe(22);
    expect(decodeFret("x")).toBeNull();
  });

  it("loads fret, finger, and barre data for a common chord", () => {
    const [cMajor] = loadChordFingerings("C", "major");

    expect(cMajor.positions).toEqual([null, 3, 2, 0, 1, 0]);
    expect(cMajor.fingers).toEqual([null, 3, 2, null, 1, null]);
    expect(cMajor.barreFrets).toEqual([]);
    expect(cMajor.midiNotes).toEqual([48, 52, 55, 60, 64]);
  });

  it("preserves explicit finger and barre metadata during hydration", () => {
    const barre = loadChordFingerings("A#", "major").find(
      (fingering) => fingering.barreFrets?.length
    );

    expect(barre).toBeDefined();
    expect(hydrateChordFingering(barre!).fingers).toHaveLength(6);
    expect(hydrateChordFingering(barre!).barreFrets).toEqual([1]);
  });
});
