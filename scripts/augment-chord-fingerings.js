const fs = require("fs");
const path = require("path");

const CSV_PATH = path.join(process.cwd(), "data", "chord-fingers.csv");
const FRET_AMOUNT = 23;
const MAX_DIAGRAM_FRETS = 4;
const MAX_GENERATED_PER_CHORD = 48;
const STANDARD_TUNING_HIGH_TO_LOW = [64, 59, 55, 50, 45, 40];
const ROOT_TO_PC = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};
const INTERVAL_TO_SEMITONES = {
  "1": 0,
  b2: 1,
  "2": 2,
  "#2": 3,
  b3: 3,
  "3": 4,
  "4": 5,
  "#4": 6,
  b5: 6,
  "5": 7,
  "#5": 8,
  b6: 8,
  "6": 9,
  bb7: 9,
  b7: 10,
  "7": 11,
  b9: 13,
  "9": 14,
  "#9": 15,
  "11": 17,
  "#11": 18,
  b13: 20,
  "13": 21,
};
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

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
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

function serializeCsv(headers, rows) {
  return [headers.join(";"), ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(";"))].join("\n") + "\n";
}

function generateTabRef() {
  return STANDARD_TUNING_HIGH_TO_LOW.map((openMidi) =>
    Array.from({ length: FRET_AMOUNT }, (_, fret) => openMidi + fret)
  );
}

function findClosestA(tabRef, coord, midi) {
  const locations = [];
  tabRef.forEach((stringMidis, stringIndex) => {
    stringMidis.forEach((value, fret) => {
      if (value === midi) locations.push([stringIndex, fret]);
    });
  });
  return locations
    .map((item) => ({
      item,
      score: item[1] === 0 ? 0 : ((coord[0] - item[0]) ** 2) * 0.1 + (((coord[1] - item[1]) * 3) ** 2),
    }))
    .sort((left, right) => left.score - right.score)
    .slice(0, 6)
    .map(({ item }) => item);
}

function powerset(items) {
  const result = [[]];
  items.forEach((item) => {
    const length = result.length;
    for (let index = 0; index < length; index += 1) {
      result.push([...result[index], item]);
    }
  });
  return result;
}

function generateOctaveCombos(baseMidis) {
  const additional = baseMidis.map((midi) => midi + 12);
  return powerset(additional)
    .map((subset) => [...baseMidis, ...subset])
    .filter((combo) => combo.length <= 6);
}

function product(lists) {
  return lists.reduce((acc, list) => acc.flatMap((prefix) => list.map((item) => [...prefix, item])), [[]]);
}

function createPossibleTabs(midiList, midiDict) {
  const valueLists = midiList.map((midi) => midiDict.get(midi) || []);
  if (valueLists.some((list) => !list.length)) return [];
  return product(valueLists).filter((combo) => {
    const strings = combo.map((item) => item[0]);
    return strings.length === new Set(strings).size;
  });
}

function scoreChord(chordTuple) {
  const frets = chordTuple.map((item) => item[1]);
  const strings = chordTuple.map((item) => item[0]);
  const distance = Math.max(...frets) - Math.min(...frets);
  const gaps = Math.max(...strings) - Math.min(...strings) + 1 - strings.length;
  return distance + 2.5 * gaps;
}

function allFingeringsFromMidis(midiContents, playCoord = [0, 0]) {
  const tabRef = generateTabRef();
  let midis = Array.from(new Set(midiContents.map((midi) => Math.round(Number(midi))).filter(Number.isFinite)));
  midis = midis.filter((midi) => !midis.includes(midi - 12));
  const normalAndOctaves = [...midis, ...midis.map((midi) => midi + 12)];
  const midiToFret = new Map();
  normalAndOctaves.forEach((midi) => {
    midiToFret.set(midi, findClosestA(tabRef, playCoord, midi));
  });
  return generateOctaveCombos(midis)
    .flatMap((midiCombo) => createPossibleTabs(midiCombo, midiToFret))
    .sort((left, right) => scoreChord(left) - scoreChord(right));
}

function parseStructure(structure) {
  return structure
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => INTERVAL_TO_SEMITONES[part])
    .filter((value) => Number.isFinite(value));
}

function chordMidis(root, structure, octaveShift) {
  const pc = ROOT_TO_PC[root];
  const intervals = parseStructure(structure);
  if (!Number.isFinite(pc) || !intervals.length) return [];
  return intervals.map((interval) => 48 + pc + interval + octaveShift);
}

function tabsToPositions(tabs) {
  const positions = Array(6).fill("x");
  tabs.forEach(([stringIndex, fret]) => {
    positions[5 - stringIndex] = String(Math.round(fret));
  });
  return positions;
}

function fitsDiagram(positions) {
  const fretted = positions
    .filter((value) => value !== "x")
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!fretted.length) return true;
  return Math.max(...fretted) - Math.min(...fretted) <= MAX_DIAGRAM_FRETS - 1;
}

function hasRoot(tabs, rootPc) {
  return tabs.some(([stringIndex, fret]) => {
    const midi = STANDARD_TUNING_HIGH_TO_LOW[stringIndex] + fret;
    return ((midi % 12) + 12) % 12 === rootPc;
  });
}

function noteNamesForTabs(tabs) {
  return tabs
    .sort((left, right) => right[0] - left[0])
    .map(([stringIndex, fret]) => NOTE_NAMES[(STANDARD_TUNING_HIGH_TO_LOW[stringIndex] + fret) % 12])
    .join(",");
}

function main() {
  const { headers, rows } = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  const existingKeys = new Set(rows.map((row) => `${row.CHORD_ROOT};${row.CHORD_TYPE};${row.FINGER_POSITIONS}`));
  const definitions = Array.from(
    new Map(
      rows.map((row) => [
        `${row.CHORD_ROOT};${row.CHORD_TYPE};${row.CHORD_STRUCTURE}`,
        {
          CHORD_ROOT: row.CHORD_ROOT,
          CHORD_TYPE: row.CHORD_TYPE,
          CHORD_STRUCTURE: row.CHORD_STRUCTURE,
        },
      ])
    ).values()
  );
  const generatedRows = [];
  const stats = { definitions: definitions.length, generated: 0, skippedDuplicate: 0, skippedNoRoot: 0 };

  definitions.forEach((definition) => {
    const rootPc = ROOT_TO_PC[definition.CHORD_ROOT];
    if (!Number.isFinite(rootPc)) return;
    const generatedForChord = [];
    [0, 12, 24].forEach((octaveShift) => {
      const midis = chordMidis(definition.CHORD_ROOT, definition.CHORD_STRUCTURE, octaveShift);
      if (!midis.length) return;
      allFingeringsFromMidis(midis, [0, 0]).forEach((tabs) => {
        const positions = tabsToPositions(tabs);
        if (!fitsDiagram(positions)) return;
        if (!hasRoot(tabs, rootPc)) {
          stats.skippedNoRoot += 1;
          return;
        }
        const key = `${definition.CHORD_ROOT};${definition.CHORD_TYPE};${positions.join(",")}`;
        if (existingKeys.has(key) || generatedForChord.some((row) => row.key === key)) {
          stats.skippedDuplicate += 1;
          return;
        }
        generatedForChord.push({
          key,
          row: {
            CHORD_ROOT: definition.CHORD_ROOT,
            CHORD_TYPE: definition.CHORD_TYPE,
            CHORD_STRUCTURE: definition.CHORD_STRUCTURE,
            FINGER_POSITIONS: positions.join(","),
            NOTE_NAMES: noteNamesForTabs(tabs),
          },
          score: scoreChord(tabs),
        });
      });
    });
    generatedForChord
      .sort((left, right) => left.score - right.score)
      .slice(0, MAX_GENERATED_PER_CHORD)
      .forEach(({ key, row }) => {
        existingKeys.add(key);
        generatedRows.push(row);
      });
  });

  const finalSeen = new Set();
  let removedFinalDuplicates = 0;
  const finalRows = [...rows, ...generatedRows].filter((row) => {
    const key = `${row.CHORD_ROOT};${row.CHORD_TYPE};${row.FINGER_POSITIONS}`;
    if (finalSeen.has(key)) {
      removedFinalDuplicates += 1;
      return false;
    }
    finalSeen.add(key);
    return true;
  });
  stats.generated = generatedRows.length;
  stats.removedFinalDuplicates = removedFinalDuplicates;
  fs.writeFileSync(CSV_PATH, serializeCsv(headers, finalRows), "utf8");
  console.log(JSON.stringify(stats, null, 2));
}

main();
