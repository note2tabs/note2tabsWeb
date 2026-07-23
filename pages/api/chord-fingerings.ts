import type { NextApiRequest, NextApiResponse } from "next";
import { readFileSync } from "fs";
import path from "path";
import type { ChordFingering } from "../../types/gte";
import { getChordFingeringMidiNotes, getChordFingeringTabs } from "../../lib/gteChordFingerings";

type JsonChordPosition = {
  frets?: unknown;
  fingers?: unknown;
  barres?: unknown;
};

type ChordFingeringIndex = Record<string, JsonChordPosition[]>;

const CHORD_ROOTS = new Set(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);
const CHORD_TYPE_PATTERN = /^[A-Za-z0-9#+-]+$/;
const DATA_PATH = path.join(process.cwd(), "data", "chord-fingerings-index.json");
const cachedFingerings = new Map<string, ChordFingering[]>();
let cachedIndex: ChordFingeringIndex | null = null;

export const decodeFret = (value: string): number | null => {
  const normalized = value.toLowerCase();
  if (normalized === "x") return null;
  const fret = Number.parseInt(normalized, 36);
  return Number.isInteger(fret) && fret >= 0 && fret <= 22 ? fret : null;
};

const decodeFinger = (value: string, fret: number | null): number | null => {
  if (fret === null || fret === 0) return null;
  const finger = Number(value);
  return Number.isInteger(finger) && finger >= 1 && finger <= 4 ? finger : null;
};

export const loadChordFingerings = (root: string, type: string): ChordFingering[] => {
  if (!CHORD_ROOTS.has(root) || !CHORD_TYPE_PATTERN.test(type)) return [];
  const cacheKey = `${root}:${type}`;
  const cached = cachedFingerings.get(cacheKey);
  if (cached) return cached;

  try {
    if (!cachedIndex) {
      cachedIndex = JSON.parse(readFileSync(DATA_PATH, "utf8")) as ChordFingeringIndex;
    }
    const rawPositions = cachedIndex[cacheKey] || [];
    const fingerings = rawPositions.flatMap((entry): ChordFingering[] => {
      if (typeof entry.frets !== "string" || entry.frets.length !== 6) return [];
      const fretText = entry.frets;
      const positions = Array.from(fretText, decodeFret);
      if (positions.some((fret, index) => fret === null && fretText[index]?.toLowerCase() !== "x")) return [];
      const fingerText = typeof entry.fingers === "string" ? entry.fingers : "000000";
      const fingers = positions.map((fret, index) => decodeFinger(fingerText[index] || "0", fret));
      const barreFret = Number(entry.barres);
      const barreFrets = Number.isInteger(barreFret) && barreFret > 0 ? [barreFret] : [];
      return [
        {
          root,
          type,
          positions,
          fingers,
          barreFrets,
          midiNotes: getChordFingeringMidiNotes(positions),
          tabs: getChordFingeringTabs(positions),
        },
      ];
    });
    cachedFingerings.set(cacheKey, fingerings);
    return fingerings;
  } catch {
    cachedFingerings.set(cacheKey, []);
    return [];
  }
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const root = typeof req.query.root === "string" ? req.query.root.trim() : "";
  const type = typeof req.query.type === "string" ? req.query.type.trim() : "";
  if (!root || !type) return res.status(400).json({ error: "Missing root or type" });

  const fingerings = loadChordFingerings(root, type).slice(0, 96);
  return res.status(200).json({ fingerings });
}
