import type { NextApiRequest, NextApiResponse } from "next";
import { readFileSync } from "fs";
import path from "path";
import type { ChordFingering } from "../../types/gte";
import { getChordFingeringMidiNotes, getChordFingeringTabs } from "../../lib/gteChordFingerings";

type CsvRow = Record<string, string>;

let cachedRows: ChordFingering[] | null = null;

const parseCsvLine = (line: string, delimiter = ";") => {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(cell);
      cell = "";
      continue;
    }
    cell += char;
  }
  cells.push(cell);
  return cells;
};

const loadFingerings = () => {
  if (cachedRows) return cachedRows;
  const filePath = path.join(process.cwd(), "data", "chord-fingers.csv");
  const raw = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = parseCsvLine(lines[0] || "").map((header) => header.trim());
  cachedRows = lines.slice(1).flatMap((line): ChordFingering[] => {
    const values = parseCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    const positions = row.FINGER_POSITIONS.split(",").map((value) => {
      const trimmed = value.trim().toLowerCase();
      if (!trimmed || trimmed === "x") return null;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
    });
    if (positions.length !== 6) return [];
    return [
      {
        root: row.CHORD_ROOT,
        type: row.CHORD_TYPE,
        positions,
        noteNames: row.NOTE_NAMES ? row.NOTE_NAMES.split(",").map((value) => value.trim()).filter(Boolean) : [],
        midiNotes: getChordFingeringMidiNotes(positions),
        tabs: getChordFingeringTabs(positions),
      },
    ];
  });
  return cachedRows;
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const root = typeof req.query.root === "string" ? req.query.root.trim() : "";
  const type = typeof req.query.type === "string" ? req.query.type.trim() : "";
  if (!root || !type) return res.status(400).json({ error: "Missing root or type" });

  const fingerings = loadFingerings()
    .filter((item) => item.root === root && item.type === type)
    .slice(0, 32);
  return res.status(200).json({ fingerings });
}
