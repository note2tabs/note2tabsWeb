const STANDARD_TUNING_MIDI_HIGH_TO_LOW = [64, 59, 55, 50, 45, 40];
const ASCII_LINE_LABELS = ["e", "B", "G", "D", "A", "E"];

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

type ParsedTabImport = {
  text: string;
  warning?: string;
};

type TabPosition = {
  column: number;
  stringIndex: number;
  fret: number;
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
  return { text: normalized };
}

export function parseMusicXmlTabImport(xml: string): ParsedTabImport {
  const notes = extractMusicXmlNotes(xml);
  if (!notes.length) {
    throw new Error("No guitar notes were found in this MusicXML file.");
  }
  return {
    text: tabPositionsToAscii(notes),
    warning: "Imported MusicXML timing is approximated for the editor grid.",
  };
}

export function parseMidiTabImport(buffer: ArrayBuffer): ParsedTabImport {
  const notes = extractMidiNotes(buffer);
  if (!notes.length) {
    throw new Error("No MIDI notes were found in this file.");
  }
  return {
    text: tabPositionsToAscii(notes),
    warning: "MIDI does not store guitar string choices, so string and fret positions were estimated.",
  };
}

export async function parseAlphaTabFileImport(buffer: ArrayBuffer): Promise<ParsedTabImport> {
  const alphaTab = await import("@coderline/alphatab");
  const settings = new alphaTab.Settings();
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(buffer), settings);
  const notes = extractAlphaTabNotes(score);
  if (!notes.length) {
    throw new Error("No guitar tablature notes were found in this file.");
  }
  return {
    text: tabPositionsToAscii(notes),
    warning: "Imported notation timing is approximated for the editor grid.",
  };
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
      column += 3;
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
      });
      return;
    }

    const midi = pitchToMidi(noteXml);
    const tab = midi === null ? null : midiToTab(midi);
    if (tab) {
      positions.push({ column, stringIndex: tab.stringIndex, fret: tab.fret });
    }
  });

  return positions;
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
  let column = 0;

  for (const staff of staves) {
    if (staff?.isPercussion) continue;
    const stringCount = Array.isArray(staff?.tuning) && staff.tuning.length ? staff.tuning.length : 6;
    const bars = Array.isArray(staff?.bars) ? staff.bars : [];
    for (const bar of bars) {
      const voices = Array.isArray(bar?.voices) ? bar.voices : [];
      const primaryVoice = voices.find((voice: any) => Array.isArray(voice?.beats) && voice.beats.length);
      if (!primaryVoice) continue;
      for (const beat of primaryVoice.beats) {
        const notes = Array.isArray(beat?.notes) ? beat.notes : [];
        notes.forEach((note: any) => {
          const fret = Number(note?.fret);
          const stringNumber = Number(note?.string);
          if (!Number.isFinite(fret) || !Number.isFinite(stringNumber) || stringNumber <= 0) return;
          positions.push({
            column,
            stringIndex: Math.max(0, Math.min(5, Math.round(stringCount - stringNumber))),
            fret: Math.max(0, Math.min(24, Math.round(fret))),
          });
        });
        column += 3;
      }
      column += 1;
    }
  }

  return positions;
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
  const noteStarts: { tick: number; midi: number }[] = [];

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
          noteStarts.push(started);
          active.delete(key);
        }
      }
    }
    offset = chunkEnd;
  }

  active.forEach((started) => noteStarts.push(started));
  const columnUnit = Math.max(1, Math.round(ticksPerQuarter / 4));
  return noteStarts
    .sort((left, right) => left.tick - right.tick || left.midi - right.midi)
    .flatMap((note) => {
      const tab = midiToTab(note.midi);
      return tab
        ? [{ column: Math.round(note.tick / columnUnit) * 2, stringIndex: tab.stringIndex, fret: tab.fret }]
        : [];
    });
}

function tabPositionsToAscii(positions: TabPosition[]) {
  const maxColumn = Math.max(16, ...positions.map((position) => position.column + String(position.fret).length + 1));
  const lines = ASCII_LINE_LABELS.map(() => Array.from({ length: maxColumn }, () => "-"));
  positions.forEach((position) => {
    const stringIndex = Math.max(0, Math.min(5, position.stringIndex));
    const fretText = String(Math.max(0, Math.min(24, Math.round(position.fret))));
    const start = Math.max(0, Math.min(maxColumn - fretText.length, Math.round(position.column)));
    for (let index = 0; index < fretText.length; index += 1) {
      lines[stringIndex][start + index] = fretText[index];
    }
  });
  return lines.map((line, index) => `${ASCII_LINE_LABELS[index]}|${line.join("")}|`).join("\n");
}
