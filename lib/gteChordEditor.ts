import { hydrateChordFingering } from "./gteChordFingerings";
import type { Chord } from "../types/gte";

export const CHORD_EDITOR_ROOTS = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export const CHORD_EDITOR_QUALITIES = [
  { name: "major", display: "", intervals: [0, 4, 7] },
  { name: "minor", display: "m", intervals: [0, 3, 7] },
  { name: "augmented", display: "aug", intervals: [0, 4, 8] },
  { name: "diminished", display: "dim", intervals: [0, 3, 6] },
  { name: "sus2", display: "sus2", intervals: [0, 2, 7] },
  { name: "sus4", display: "sus4", intervals: [0, 5, 7] },
  { name: "power", display: "5", intervals: [0, 7] },
] as const;

export const CHORD_EDITOR_EXTENSIONS = [
  { name: "", display: "", intervals: [] },
  { name: "6", display: "6", intervals: [9] },
  { name: "7", display: "7", intervals: [10] },
  { name: "maj7", display: "maj7", intervals: [11] },
  { name: "9", display: "9", intervals: [10, 14] },
  { name: "maj9", display: "maj9", intervals: [11, 14] },
  { name: "11", display: "11", intervals: [10, 14, 17] },
  { name: "13", display: "13", intervals: [10, 14, 17, 21] },
] as const;

export const getChordEditorQuality = (quality: unknown) => {
  const raw = typeof quality === "string" ? quality : "major";
  return CHORD_EDITOR_QUALITIES.find((item) => item.name === raw) ?? CHORD_EDITOR_QUALITIES[0];
};

export const getChordEditorExtension = (extension: unknown) => {
  const raw = typeof extension === "string" ? extension : "";
  return CHORD_EDITOR_EXTENSIONS.find((item) => item.name === raw) ?? CHORD_EDITOR_EXTENSIONS[0];
};

export const getChordEditorLabel = (
  root: string,
  quality: string,
  extension: string = ""
) => {
  const qualityDisplay = getChordEditorQuality(quality).display;
  const extensionDisplay = getChordEditorExtension(extension).display;
  return `${root}${qualityDisplay}${extensionDisplay}`;
};

export const getChordEditorRootMidi = (root: unknown) => {
  const rootIndex = CHORD_EDITOR_ROOTS.findIndex((item) => item === root);
  return 48 + (rootIndex >= 0 ? rootIndex : 0);
};

export const inferChordEditorMetadataFromMidi = (midis: unknown) => {
  if (!Array.isArray(midis) || !midis.length) return null;
  const pitchClasses = Array.from(
    new Set(
      midis
        .map((midi) => Number(midi))
        .filter((midi) => Number.isFinite(midi))
        .map((midi) => ((Math.round(midi) % 12) + 12) % 12)
    )
  );
  if (!pitchClasses.length) return null;
  for (const rootIndex of pitchClasses) {
    const intervals = new Set(
      pitchClasses.map((pitchClass) => (pitchClass - rootIndex + 12) % 12)
    );
    const quality = CHORD_EDITOR_QUALITIES.find((candidate) =>
      candidate.intervals.every((interval) => intervals.has(interval % 12))
    );
    if (!quality) continue;
    const root = CHORD_EDITOR_ROOTS[rootIndex] || "C";
    return {
      root,
      quality: quality.name,
      extension: "",
      label: getChordEditorLabel(root, quality.name),
    };
  }
  const root = CHORD_EDITOR_ROOTS[pitchClasses[0]] || "C";
  return {
    root,
    quality: "major",
    extension: "",
    label: root,
  };
};

export const getChordEditorMidiNotes = (
  chord: Pick<Chord, "root" | "quality"> & {
    extension?: unknown;
    fingering?: Chord["fingering"];
    currentTabs?: Chord["currentTabs"];
  }
) => {
  if (chord.fingering) {
    const fingering = hydrateChordFingering(chord.fingering);
    if (fingering.midiNotes?.length) return fingering.midiNotes;
  }
  const rootMidi = getChordEditorRootMidi(chord.root);
  const quality = getChordEditorQuality(chord.quality);
  const extension = getChordEditorExtension(chord.extension);
  return [...quality.intervals, ...extension.intervals]
    .map((interval) => rootMidi + interval)
    .filter(
      (midi, index, values) =>
        Number.isFinite(midi) && values.indexOf(midi) === index
    );
};
