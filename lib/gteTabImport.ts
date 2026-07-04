const STANDARD_TUNING_MIDI_HIGH_TO_LOW = [64, 59, 55, 50, 45, 40];
const ASCII_LINE_LABELS = ["e", "B", "G", "D", "A", "E"];
const FIXED_FRAMES_PER_BAR = 480;
const DEFAULT_SECONDS_PER_BAR = 2;
const DEFAULT_FPS = Math.round(FIXED_FRAMES_PER_BAR / DEFAULT_SECONDS_PER_BAR);
const DEFAULT_ALPHA_TAB_TICKS_PER_QUARTER = 960;
export const TAB_IMPORT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const TAB_IMPORT_MAX_TEXT_FILE_SIZE_BYTES = 256 * 1024;
export const TAB_IMPORT_MAX_TEXT_CHARS = 120_000;
export const TAB_IMPORT_MAX_LINES = 1_500;
export const TAB_IMPORT_MAX_LINE_LENGTH = 2_000;
export const TAB_IMPORT_MAX_GENERATED_NOTES = 5_000;
export const TAB_IMPORT_MAX_GENERATED_COLUMNS = 240_000;
export const TAB_IMPORT_MAX_FILENAME_LENGTH = 120;

export const TAB_IMPORT_ACCEPT = [
  ".txt",
  ".text",
  ".tab",
  ".asc",
  ".xml",
  ".musicxml",
  ".mid",
  ".midi",
  ".gp",
  ".gp3",
  ".gp4",
  ".gp5",
  ".gpx",
  ".gtp",
  ".ptb",
  ".tef",
  ".tg",
  ".mxl",
].join(",");

export const TAB_IMPORT_SUPPORTED_FORMATS = [
  "ASCII tab (.txt, .tab, .asc)",
  "MusicXML (.musicxml, .xml)",
  "MIDI (.mid, .midi)",
  "Guitar Pro (.gp, .gp3, .gp4, .gp5, .gpx, .gtp)",
  "PowerTab (.ptb)",
  "TablEdit (.tef)",
  "TuxGuitar (.tg)",
  "Compressed MusicXML (.mxl)",
] as const;

const TEXT_EXTENSIONS = new Set(["txt", "text", "tab", "asc"]);
const MUSICXML_EXTENSIONS = new Set(["xml", "musicxml"]);
const MIDI_EXTENSIONS = new Set(["mid", "midi"]);
const ALPHATAB_EXTENSIONS = new Set(["gp", "gp3", "gp4", "gp5", "gpx", "gtp", "xml", "musicxml"]);
const RECOGNIZED_BINARY_EXTENSIONS = new Set(["gp", "gp3", "gp4", "gp5", "gpx", "gtp", "ptb", "tef", "tg", "mxl"]);
const TAB_TEXT_LABEL_RE = /^\s*([eEBDGA])\s*[\|:]/;

type ParsedTabImport = {
  text: string;
  stamps: Array<[number, [number, number], number]>;
  framesPerMessure: number;
  fps: number;
  totalFrames: number;
  warning?: string;
};

export type ParsedTabFileImport = ParsedTabImport & {
  name: string;
  fileName: string;
};

type TabPosition = {
  column: number;
  stringIndex: number;
  fret: number;
  length?: number;
};

export function getTabImportExtension(fileName: string) {
  const clean = fileName.trim().toLowerCase();
  const lastDot = clean.lastIndexOf(".");
  return lastDot >= 0 ? clean.slice(lastDot + 1) : "";
}

export function getImportNameFromFile(fileName: string) {
  const trimmed = fileName.trim();
  const lastSlash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  const base = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
  const lastDot = base.lastIndexOf(".");
  return (lastDot > 0 ? base.slice(0, lastDot) : base).trim() || "Imported tab";
}

export function getTabImportFileSizeLimit(fileName: string) {
  const extension = getTabImportExtension(fileName);
  return TEXT_EXTENSIONS.has(extension) ? TAB_IMPORT_MAX_TEXT_FILE_SIZE_BYTES : TAB_IMPORT_MAX_FILE_SIZE_BYTES;
}

export function isRecognizedTabImportExtension(extension: string) {
  const ext = extension.toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || MUSICXML_EXTENSIONS.has(ext) || MIDI_EXTENSIONS.has(ext) || RECOGNIZED_BINARY_EXTENSIONS.has(ext);
}

export function getUnsupportedTabImportMessage(fileName: string) {
  const extension = getTabImportExtension(fileName);
  if (!isRecognizedTabImportExtension(extension)) {
    return "This file type is not recognized as a common tab format.";
  }
  if (extension === "mxl") {
    return "Compressed MusicXML (.mxl) is recognized, but this browser importer cannot unzip it yet. Export as .musicxml or .xml and import that file.";
  }
  return "This format is recognized, but it needs a PowerTab/TablEdit/TuxGuitar converter before it can be imported into this editor. Export it as Guitar Pro, MusicXML, MIDI, or ASCII tab first.";
}

export function parseTextTabImport(text: string): ParsedTabImport {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    throw new Error("The selected file is empty.");
  }
  validateAsciiTabText(normalized);
  return buildParsedImportFromPositions(extractAsciiTabNotes(normalized), normalized, {
    warning: "ASCII tab timing is estimated from spacing.",
  });
}

export async function parseTabImportFile(file: File): Promise<ParsedTabFileImport> {
  if (file.name.length > TAB_IMPORT_MAX_FILENAME_LENGTH) {
    throw new Error("This filename is too long. Rename it and try again.");
  }
  const maxSize = getTabImportFileSizeLimit(file.name);
  if (file.size <= 0) {
    throw new Error("The selected file is empty.");
  }
  if (file.size > maxSize) {
    const limitLabel = maxSize >= 1024 * 1024 ? `${Math.round(maxSize / 1024 / 1024)} MB` : `${Math.round(maxSize / 1024)} KB`;
    throw new Error(`This tab file is too large. Choose a file under ${limitLabel}.`);
  }

  const extension = getTabImportExtension(file.name);
  if (!isRecognizedTabImportExtension(extension)) {
    throw new Error(getUnsupportedTabImportMessage(file.name));
  }

  let parsed: ParsedTabImport;
  if (extension === "mid" || extension === "midi") {
    parsed = parseMidiTabImport(await file.arrayBuffer());
  } else if (canParseWithAlphaTab(extension)) {
    try {
      parsed = await parseAlphaTabFileImport(await file.arrayBuffer());
    } catch (alphaTabError) {
      if (extension !== "xml" && extension !== "musicxml") {
        throw alphaTabError;
      }
      parsed = parseMusicXmlTabImport(await file.text());
    }
  } else if (extension === "xml" || extension === "musicxml") {
    parsed = parseMusicXmlTabImport(await file.text());
  } else if (extension === "txt" || extension === "text" || extension === "tab" || extension === "asc") {
    parsed = parseTextTabImport(await file.text());
  } else {
    throw new Error(getUnsupportedTabImportMessage(file.name));
  }

  return {
    ...validateParsedImport(parsed),
    name: getImportNameFromFile(file.name),
    fileName: file.name,
  };
}

export function validateParsedImport(parsed: ParsedTabImport): ParsedTabImport {
  validateImportTextBounds(parsed.text);
  limitStamps(parsed.stamps);
  return parsed;
}

function validateImportTextBounds(text: string) {
  if (text.length > TAB_IMPORT_MAX_TEXT_CHARS) {
    throw new Error("This tab is too long to import safely.");
  }
  const lines = text.split("\n");
  if (lines.length > TAB_IMPORT_MAX_LINES) {
    throw new Error("This tab has too many lines to import safely.");
  }
  if (lines.some((line) => line.length > TAB_IMPORT_MAX_LINE_LENGTH)) {
    throw new Error("This tab has a line that is too long to import safely.");
  }
}

function validateAsciiTabText(text: string) {
  validateImportTextBounds(text);
  const labeledLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => TAB_TEXT_LABEL_RE.test(line));
  if (labeledLines.length < 6) {
    throw new Error("This text file does not look like a six-string guitar tab.");
  }
  const labels = new Set(labeledLines.slice(0, 12).map((line) => line.match(TAB_TEXT_LABEL_RE)?.[1].toUpperCase()));
  const hasTabCharacters = labeledLines.some((line) => /[-|:\d]/.test(line) && /\d/.test(line));
  if (labels.size < 5 || !hasTabCharacters) {
    throw new Error("This text file does not look like a six-string guitar tab.");
  }
}

export function parseMusicXmlTabImport(xml: string): ParsedTabImport {
  const notes = extractMusicXmlNotes(xml);
  if (!notes.length) {
    throw new Error("No guitar notes were found in this MusicXML file.");
  }
  return buildParsedImportFromPositions(notes, undefined, {
    warning: "Imported MusicXML timing is approximated for the editor grid.",
  });
}

export function parseMidiTabImport(buffer: ArrayBuffer): ParsedTabImport {
  const notes = extractMidiNotes(buffer);
  if (!notes.length) {
    throw new Error("No MIDI notes were found in this file.");
  }
  return buildParsedImportFromPositions(notes, undefined, {
    warning: "MIDI does not store guitar string choices, so string and fret positions were estimated.",
  });
}

export async function parseAlphaTabFileImport(buffer: ArrayBuffer): Promise<ParsedTabImport> {
  const alphaTab = await import("@coderline/alphatab");
  const settings = new alphaTab.Settings();
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(buffer), settings);
  const notes = extractAlphaTabNotes(score);
  if (!notes.length) {
    throw new Error("No guitar tablature notes were found in this file.");
  }
  return buildParsedImportFromPositions(notes, undefined, {
    warning: "Imported notation timing is approximated for the editor grid.",
  });
}

export function canParseWithAlphaTab(extension: string) {
  return ALPHATAB_EXTENSIONS.has(extension.toLowerCase());
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function getTagText(source: string, tagName: string) {
  const match = source.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? decodeXmlEntities(match[1].trim()) : "";
}

function pitchToMidi(noteXml: string) {
  const pitch = noteXml.match(/<pitch(?:\s[^>]*)?>([\s\S]*?)<\/pitch>/i)?.[1] || "";
  if (!pitch) return null;
  const step = getTagText(pitch, "step").toUpperCase();
  const octave = Number(getTagText(pitch, "octave"));
  const alter = Number(getTagText(pitch, "alter") || 0);
  const semitones: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  if (!(step in semitones) || !Number.isFinite(octave)) return null;
  return (octave + 1) * 12 + semitones[step] + (Number.isFinite(alter) ? alter : 0);
}

function midiToTab(midi: number): { stringIndex: number; fret: number } | null {
  let best: { stringIndex: number; fret: number } | null = null;
  STANDARD_TUNING_MIDI_HIGH_TO_LOW.forEach((openMidi, stringIndex) => {
    const fret = Math.round(midi - openMidi);
    if (fret < 0 || fret > 24) return;
    if (!best || fret < best.fret) best = { stringIndex, fret };
  });
  return best;
}

function extractMusicXmlNotes(xml: string): TabPosition[] {
  const noteMatches = xml.match(/<note(?:\s[^>]*)?>[\s\S]*?<\/note>/gi) || [];
  const positions: TabPosition[] = [];
  let column = 0;

  noteMatches.forEach((noteXml) => {
    const isRest = /<rest(?:\s[^>]*)?\/?>/i.test(noteXml);
    const isChord = /<chord(?:\s[^>]*)?\/?>/i.test(noteXml);
    if (!isChord && positions.length > 0) {
      column += Math.round(FIXED_FRAMES_PER_BAR / 4);
    }
    if (isRest) return;

    const technical = noteXml.match(/<technical(?:\s[^>]*)?>([\s\S]*?)<\/technical>/i)?.[1] || noteXml;
    const musicXmlString = Number(getTagText(technical, "string"));
    const fret = Number(getTagText(technical, "fret"));
    if (Number.isFinite(musicXmlString) && Number.isFinite(fret)) {
      positions.push({
        column,
        stringIndex: Math.max(0, Math.min(5, Math.round(musicXmlString) - 1)),
        fret: Math.max(0, Math.min(24, Math.round(fret))),
        length: Math.round(FIXED_FRAMES_PER_BAR / 4),
      });
      return;
    }

    const midi = pitchToMidi(noteXml);
    const tab = midi === null ? null : midiToTab(midi);
    if (tab) {
      positions.push({ column, stringIndex: tab.stringIndex, fret: tab.fret, length: Math.round(FIXED_FRAMES_PER_BAR / 4) });
    }
  });

  return limitTabPositions(positions);
}

function extractAlphaTabNotes(score: any): TabPosition[] {
  const tracks = Array.isArray(score?.tracks) ? score.tracks : [];
  for (const track of tracks) {
    if (track?.isPercussion) continue;
    const trackNotes = extractAlphaTabTrackNotes(track);
    if (trackNotes.length) return trackNotes;
  }
  return [];
}

function extractAlphaTabTrackNotes(track: any): TabPosition[] {
  const positions: TabPosition[] = [];
  const staves = Array.isArray(track?.staves) ? track.staves : [];

  for (const staff of staves) {
    if (staff?.isPercussion) continue;
    const stringCount = Array.isArray(staff?.tuning) && staff.tuning.length ? staff.tuning.length : 6;
    const bars = Array.isArray(staff?.bars) ? staff.bars : [];
    for (const bar of bars) {
      const voices = Array.isArray(bar?.voices) ? bar.voices : [];
      const beats = voices.flatMap((voice: any) => (Array.isArray(voice?.beats) ? voice.beats : []));
      if (!beats.length) continue;
      const barTickLength = Math.max(
        DEFAULT_ALPHA_TAB_TICKS_PER_QUARTER * 4,
        ...beats.map((beat: any) => {
          const start = getAlphaTabBeatStart(beat);
          const duration = getAlphaTabBeatDuration(beat);
          return start + duration;
        })
      );
      const barStartFrame = Math.max(0, Math.round(Number(bar?.index) || 0)) * FIXED_FRAMES_PER_BAR;
      for (const beat of beats) {
        const startFrame = barStartFrame + Math.round((getAlphaTabBeatStart(beat) / barTickLength) * FIXED_FRAMES_PER_BAR);
        const length = Math.max(1, Math.round((getAlphaTabBeatDuration(beat) / barTickLength) * FIXED_FRAMES_PER_BAR));
        const notes = Array.isArray(beat?.notes) ? beat.notes : [];
        notes.forEach((note: any) => {
          const fret = Number(note?.fret);
          const stringNumber = Number(note?.string);
          if (!Number.isFinite(fret) || !Number.isFinite(stringNumber) || stringNumber <= 0) return;
          positions.push({
            column: startFrame,
            stringIndex: Math.max(0, Math.min(5, Math.round(stringCount - stringNumber))),
            fret: Math.max(0, Math.min(24, Math.round(fret))),
            length,
          });
        });
      }
    }
  }

  return limitTabPositions(positions);
}

function getAlphaTabBeatStart(beat: any) {
  const value = Number(beat?.playbackStart ?? beat?.displayStart ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function getAlphaTabBeatDuration(beat: any) {
  const value = Number(beat?.playbackDuration ?? beat?.displayDuration ?? 0);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_ALPHA_TAB_TICKS_PER_QUARTER;
}

function readAscii(view: DataView, offset: number, length: number) {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }
  return value;
}

function readVariableLength(view: DataView, offset: number) {
  let value = 0;
  let cursor = offset;
  for (let guard = 0; guard < 4; guard += 1) {
    const byte = view.getUint8(cursor);
    cursor += 1;
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) break;
  }
  return { value, offset: cursor };
}

function extractMidiNotes(buffer: ArrayBuffer): TabPosition[] {
  const view = new DataView(buffer);
  if (view.byteLength < 14 || readAscii(view, 0, 4) !== "MThd") {
    throw new Error("This does not look like a valid MIDI file.");
  }
  const headerLength = view.getUint32(4);
  const ticksPerQuarter = Math.max(1, view.getUint16(12) & 0x7fff);
  let offset = 8 + headerLength;
  const active = new Map<string, { tick: number; midi: number }>();
  const noteEvents: { startTick: number; endTick: number; midi: number }[] = [];

  while (offset + 8 <= view.byteLength) {
    const chunkType = readAscii(view, offset, 4);
    const chunkLength = view.getUint32(offset + 4);
    offset += 8;
    const chunkEnd = Math.min(view.byteLength, offset + chunkLength);
    if (chunkType !== "MTrk") {
      offset = chunkEnd;
      continue;
    }

    let tick = 0;
    let runningStatus = 0;
    while (offset < chunkEnd) {
      const delta = readVariableLength(view, offset);
      tick += delta.value;
      offset = delta.offset;
      let status = view.getUint8(offset);
      if (status < 0x80) {
        status = runningStatus;
      } else {
        offset += 1;
        runningStatus = status;
      }

      if (status === 0xff) {
        offset += 1;
        const metaLength = readVariableLength(view, offset);
        offset = metaLength.offset + metaLength.value;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        const sysexLength = readVariableLength(view, offset);
        offset = sysexLength.offset + sysexLength.value;
        continue;
      }

      const eventType = status & 0xf0;
      const channel = status & 0x0f;
      if (eventType === 0xc0 || eventType === 0xd0) {
        offset += 1;
        continue;
      }
      const midi = view.getUint8(offset);
      const velocity = view.getUint8(offset + 1);
      offset += 2;
      const key = `${channel}:${midi}`;
      if (eventType === 0x90 && velocity > 0) {
        active.set(key, { tick, midi });
      } else if (eventType === 0x80 || eventType === 0x90) {
        const started = active.get(key);
        if (started) {
          noteEvents.push({ startTick: started.tick, endTick: Math.max(tick, started.tick + 1), midi: started.midi });
          active.delete(key);
        }
      }
    }
    offset = chunkEnd;
  }

  active.forEach((started) => noteEvents.push({ startTick: started.tick, endTick: started.tick + ticksPerQuarter, midi: started.midi }));
  const ticksPerBar = Math.max(1, ticksPerQuarter * 4);
  return limitTabPositions(noteEvents
    .sort((left, right) => left.startTick - right.startTick || left.midi - right.midi)
    .flatMap((note) => {
      const tab = midiToTab(note.midi);
      return tab
        ? [{
            column: Math.round((note.startTick / ticksPerBar) * FIXED_FRAMES_PER_BAR),
            stringIndex: tab.stringIndex,
            fret: tab.fret,
            length: Math.max(1, Math.round(((note.endTick - note.startTick) / ticksPerBar) * FIXED_FRAMES_PER_BAR)),
          }]
        : [];
    }));
}

function stripAsciiTabPrefix(line: string) {
  const trimmed = line.trim();
  const match = trimmed.match(/^([eEBDGA])\s*[\|:]/);
  return match ? trimmed.slice(match[0].length) : trimmed;
}

function extractAsciiTabNotes(text: string): TabPosition[] {
  const labeled = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => TAB_TEXT_LABEL_RE.test(line));
  const positions: TabPosition[] = [];
  let globalBarIndex = 0;

  for (let offset = 0; offset + 5 < labeled.length; offset += 6) {
    const block = labeled.slice(offset, offset + 6).map(stripAsciiTabPrefix);
    const splitLines = block.map((line) => line.split("|").filter((part) => part.length > 0));
    const barCount = Math.max(...splitLines.map((parts) => parts.length), 0);

    for (let barIndex = 0; barIndex < barCount; barIndex += 1) {
      const segments = splitLines.map((parts) => parts[barIndex] ?? "");
      const barWidth = Math.max(1, ...segments.map((segment) => segment.length));
      segments.forEach((segment, stringIndex) => {
        let column = 0;
        while (column < segment.length) {
          const char = segment[column];
          if (char >= "0" && char <= "9") {
            let end = column + 1;
            while (end < segment.length && segment[end] >= "0" && segment[end] <= "9") {
              end += 1;
            }
            const fret = Number(segment.slice(column, end));
            if (Number.isFinite(fret)) {
              const startFrame =
                globalBarIndex * FIXED_FRAMES_PER_BAR +
                Math.round((column / barWidth) * FIXED_FRAMES_PER_BAR);
              const length = Math.max(1, Math.round(((end - column) / barWidth) * FIXED_FRAMES_PER_BAR));
              positions.push({
                column: startFrame,
                stringIndex,
                fret,
                length,
              });
            }
            column = end;
            continue;
          }
          column += 1;
        }
      });
      globalBarIndex += 1;
    }
  }

  return limitTabPositions(positions);
}

function buildParsedImportFromPositions(
  positions: TabPosition[],
  sourceText?: string,
  options?: { warning?: string }
): ParsedTabImport {
  const safePositions = limitTabPositions(positions);
  const stamps = limitStamps(
    safePositions
      .map((position) => {
        const start = Math.max(0, Math.round(position.column));
        const length = Math.max(1, Math.round(position.length ?? Math.round(FIXED_FRAMES_PER_BAR / 16)));
        const tab: [number, number] = [
          Math.max(0, Math.min(5, Math.round(position.stringIndex))),
          Math.max(0, Math.min(24, Math.round(position.fret))),
        ];
        return [start, tab, length] as [number, [number, number], number];
      })
      .sort((left, right) => left[0] - right[0] || left[1][0] - right[1][0] || left[1][1] - right[1][1])
  );
  const totalFrames = Math.max(
    FIXED_FRAMES_PER_BAR,
    ...stamps.map((stamp) => stamp[0] + Math.max(1, stamp[2]))
  );
  return {
    text: sourceText ?? tabPositionsToAscii(safePositions),
    stamps,
    framesPerMessure: FIXED_FRAMES_PER_BAR,
    fps: DEFAULT_FPS,
    totalFrames,
    warning: options?.warning,
  };
}

function limitStamps(stamps: Array<[number, [number, number], number]>) {
  if (stamps.length > TAB_IMPORT_MAX_GENERATED_NOTES) {
    throw new Error("This tab has too many notes to import safely.");
  }
  if (stamps.some((stamp) => stamp[0] > TAB_IMPORT_MAX_GENERATED_COLUMNS || stamp[0] + stamp[2] > TAB_IMPORT_MAX_GENERATED_COLUMNS)) {
    throw new Error("This tab is too long to import safely.");
  }
  return stamps;
}

function tabPositionsToAscii(positions: TabPosition[]) {
  limitTabPositions(positions);
  const previewFrameUnit = Math.max(1, Math.round(FIXED_FRAMES_PER_BAR / 16));
  const maxColumn = Math.max(
    16,
    ...positions.map((position) => Math.round(position.column / previewFrameUnit) + String(position.fret).length + 1)
  );
  if (maxColumn > TAB_IMPORT_MAX_TEXT_CHARS) {
    throw new Error("This tab is too long to import safely.");
  }
  const lines = ASCII_LINE_LABELS.map(() => Array.from({ length: maxColumn }, () => "-"));
  positions.forEach((position) => {
    const stringIndex = Math.max(0, Math.min(5, position.stringIndex));
    const fretText = String(Math.max(0, Math.min(24, Math.round(position.fret))));
    const start = Math.max(0, Math.min(maxColumn - fretText.length, Math.round(position.column / previewFrameUnit)));
    for (let index = 0; index < fretText.length; index += 1) {
      lines[stringIndex][start + index] = fretText[index];
    }
  });
  return lines.map((line, index) => `${ASCII_LINE_LABELS[index]}|${line.join("")}|`).join("\n");
}

function limitTabPositions(positions: TabPosition[]) {
  if (positions.length > TAB_IMPORT_MAX_GENERATED_NOTES) {
    throw new Error("This tab has too many notes to import safely.");
  }
  if (positions.some((position) => position.column > TAB_IMPORT_MAX_GENERATED_COLUMNS)) {
    throw new Error("This tab is too long to import safely.");
  }
  return positions;
}
