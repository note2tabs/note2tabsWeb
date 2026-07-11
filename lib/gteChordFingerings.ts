import type { Chord, ChordFingering, TabCoord } from "../types/gte";

const STANDARD_OPEN_STRING_MIDI_LOW_TO_HIGH = [40, 45, 50, 55, 59, 64];

export const getChordFingeringCsvType = (chord: Pick<Chord, "quality" | "extension">) => {
  const quality = typeof chord.quality === "string" && chord.quality ? chord.quality : "major";
  const extension = typeof chord.extension === "string" ? chord.extension : "";

  if (quality === "major") return extension === "" ? "maj" : extension;
  if (quality === "minor") return extension === "" ? "m" : extension ? `m${extension}` : "m";
  if (quality === "augmented") return extension === "" ? "aug" : `aug${extension}`;
  if (quality === "diminished") return extension === "" ? "dim" : extension === "7" ? "dim7" : `dim${extension}`;
  if (quality === "power") return "5";
  if (quality === "sus2") return extension === "" ? "sus2" : `${extension}sus2`;
  if (quality === "sus4") return extension === "" ? "sus4" : extension === "7" ? "7sus4" : `${extension}sus4`;
  return extension || "maj";
};

export const getChordFingeringMidiNotes = (positions: Array<number | null>) =>
  positions
    .slice(0, 6)
    .map((fret, index) => (typeof fret === "number" ? STANDARD_OPEN_STRING_MIDI_LOW_TO_HIGH[index] + fret : null))
    .filter((midi): midi is number => Number.isFinite(Number(midi)));

export const getChordFingeringTabs = (positions: Array<number | null>): TabCoord[] =>
  positions
    .slice(0, 6)
    .map((fret, index): TabCoord | null => (typeof fret === "number" ? [5 - index, fret] : null))
    .filter((tab): tab is TabCoord => Boolean(tab));

export const hydrateChordFingering = (fingering: ChordFingering): ChordFingering => {
  const positions = Array.isArray(fingering.positions) ? fingering.positions.slice(0, 6) : [];
  while (positions.length < 6) positions.push(null);
  const normalizedPositions = positions.map((value) => {
    if (value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
  });
  return {
    ...fingering,
    positions: normalizedPositions,
    midiNotes: fingering.midiNotes?.length ? fingering.midiNotes : getChordFingeringMidiNotes(normalizedPositions),
    tabs: fingering.tabs?.length ? fingering.tabs : getChordFingeringTabs(normalizedPositions),
  };
};
