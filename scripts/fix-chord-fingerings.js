const fs = require("fs");
const path = require("path");

const CSV_PATH = path.join(process.cwd(), "data", "chord-fingers.csv");
const STANDARD_TUNING_LOW_TO_HIGH = [40, 45, 50, 55, 59, 64];
const DEFAULT_MAX_FRET = 22;
const NOTE_BASE_PC = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

function parseArgs(argv) {
  const options = {
    write: false,
    maxFret: DEFAULT_MAX_FRET,
    maxShift: 2,
    maxChanges: 1,
    preview: 25,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write") {
      options.write = true;
    } else if (arg === "--max-fret") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 0) {
        throw new Error("--max-fret must be a non-negative integer");
      }
      options.maxFret = value;
      index += 1;
    } else if (arg === "--preview") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 0) {
        throw new Error("--preview must be a non-negative integer");
      }
      options.preview = value;
      index += 1;
    } else if (arg === "--max-shift") {
      const rawValue = argv[index + 1];
      if (rawValue === "any") {
        options.maxShift = null;
      } else {
        const value = Number(rawValue);
        if (!Number.isInteger(value) || value < 0) {
          throw new Error('--max-shift must be a non-negative integer or "any"');
        }
        options.maxShift = value;
      }
      index += 1;
    } else if (arg === "--max-changes") {
      const rawValue = argv[index + 1];
      if (rawValue === "any") {
        options.maxChanges = null;
      } else {
        const value = Number(rawValue);
        if (!Number.isInteger(value) || value < 1) {
          throw new Error('--max-changes must be a positive integer or "any"');
        }
        options.maxChanges = value;
      }
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/fix-chord-fingerings.js [--write] [--max-fret 22] [--max-shift 2|any] [--max-changes 1|any] [--preview 25]

Corrects data/chord-fingers.csv by comparing FINGER_POSITIONS against NOTE_NAMES.
By default it only reports typo-sized changes. Pass --write to update the CSV.`);
}

function parseCsvLine(line, delimiter = ";") {
  const cells = [];
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
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsv(raw) {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const rows = lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const row = { __line: index + 2 };
    headers.forEach((header, cellIndex) => {
      row[header] = cells[cellIndex] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

function serializeCsv(headers, rows) {
  return `${[
    headers.join(";"),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(";")),
  ].join("\n")}\n`;
}

function normalizePc(value) {
  return ((value % 12) + 12) % 12;
}

function noteNameToPc(noteName) {
  const match = String(noteName).trim().match(/^([A-Ga-g])([#b]*)$/);
  if (!match) return null;

  const basePc = NOTE_BASE_PC[match[1].toUpperCase()];
  if (!Number.isFinite(basePc)) return null;

  const accidentalOffset = [...match[2]].reduce((total, accidental) => {
    if (accidental === "#") return total + 1;
    if (accidental === "b") return total - 1;
    return total;
  }, 0);

  return normalizePc(basePc + accidentalOffset);
}

function parsePositions(value) {
  return String(value)
    .split(",")
    .map((part) => {
      const trimmed = part.trim().toLowerCase();
      if (trimmed === "x") return "x";
      const parsed = Number(trimmed);
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
    });
}

function parseNoteNames(value) {
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function fretPc(stringIndex, fret) {
  return normalizePc(STANDARD_TUNING_LOW_TO_HIGH[stringIndex] + fret);
}

function closestFretForPc(stringIndex, currentFret, targetPc, maxFret) {
  let bestFret = null;
  let bestDistance = Infinity;

  for (let fret = 0; fret <= maxFret; fret += 1) {
    if (fretPc(stringIndex, fret) !== targetPc) continue;

    const distance = Math.abs(fret - currentFret);
    if (
      distance < bestDistance ||
      (distance === bestDistance && bestFret !== null && fret < bestFret)
    ) {
      bestFret = fret;
      bestDistance = distance;
    }
  }

  return bestFret;
}

function fixRow(row, maxFret, maxShift, maxChanges) {
  const positions = parsePositions(row.FINGER_POSITIONS);
  if (positions.length !== 6 || positions.some((position) => position === null)) {
    return { status: "skipped", reason: "invalid_positions" };
  }

  const noteNames = parseNoteNames(row.NOTE_NAMES);
  const playedStringIndexes = positions
    .map((position, index) => (position === "x" ? null : index))
    .filter((index) => index !== null);

  if (noteNames.length !== playedStringIndexes.length) {
    return { status: "skipped", reason: "note_count_mismatch" };
  }

  const updatedPositions = positions.slice();
  const changes = [];

  for (let noteIndex = 0; noteIndex < noteNames.length; noteIndex += 1) {
    const stringIndex = playedStringIndexes[noteIndex];
    const currentFret = positions[stringIndex];
    const targetPc = noteNameToPc(noteNames[noteIndex]);

    if (targetPc === null) {
      return { status: "skipped", reason: "invalid_note_name" };
    }

    const currentPc = fretPc(stringIndex, currentFret);
    if (currentPc === targetPc) continue;

    const correctedFret = closestFretForPc(stringIndex, currentFret, targetPc, maxFret);
    if (correctedFret === null) {
      return { status: "skipped", reason: "no_matching_fret" };
    }
    if (maxShift !== null && Math.abs(correctedFret - currentFret) > maxShift) {
      return { status: "skipped", reason: "excessive_shift" };
    }

    updatedPositions[stringIndex] = correctedFret;
    changes.push({
      string: stringIndex + 1,
      note: noteNames[noteIndex],
      from: currentFret,
      to: correctedFret,
    });
  }

  if (!changes.length) return { status: "unchanged" };
  if (maxChanges !== null && changes.length > maxChanges) {
    return { status: "skipped", reason: "too_many_changes" };
  }

  return {
    status: "changed",
    changes,
    from: row.FINGER_POSITIONS,
    to: updatedPositions.join(","),
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const { headers, rows } = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));

  if (!headers.includes("FINGER_POSITIONS") || !headers.includes("NOTE_NAMES")) {
    throw new Error("CSV must include FINGER_POSITIONS and NOTE_NAMES headers");
  }

  const stats = {
    rows: rows.length,
    changed: 0,
    unchanged: 0,
    skipped: {},
    write: options.write,
    maxFret: options.maxFret,
    maxShift: options.maxShift,
    maxChanges: options.maxChanges,
  };
  const preview = [];

  rows.forEach((row) => {
    const result = fixRow(row, options.maxFret, options.maxShift, options.maxChanges);
    if (result.status === "changed") {
      stats.changed += 1;
      row.FINGER_POSITIONS = result.to;
      if (preview.length < options.preview) {
        preview.push({
          line: row.__line,
          chord: `${row.CHORD_ROOT}${row.CHORD_TYPE}`,
          from: result.from,
          to: result.to,
          changes: result.changes,
        });
      }
    } else if (result.status === "skipped") {
      stats.skipped[result.reason] = (stats.skipped[result.reason] || 0) + 1;
    } else {
      stats.unchanged += 1;
    }
  });

  if (options.write && stats.changed > 0) {
    fs.writeFileSync(CSV_PATH, serializeCsv(headers, rows), "utf8");
  }

  console.log(JSON.stringify({ stats, preview }, null, 2));
}

main();
