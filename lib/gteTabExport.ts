import { buildTabTextFromSnapshot } from "./gteTabText";
import type { EditorSnapshot, TabCoord } from "../types/gte";

export type GteExportFormat = "json" | "txt" | "musicxml" | "midi";

export type GteExportFile = {
  filename: string;
  mimeType: string;
  content: string | Uint8Array;
};

export const GTE_EXPORT_FORMAT_OPTIONS: Array<{ value: GteExportFormat; label: string }> = [
  { value: "txt", label: "TXT" },
  { value: "json", label: "Note2Tabs JSON" },
  { value: "musicxml", label: "MusicXML" },
  { value: "midi", label: "MIDI" },
];

const DEFAULT_FILENAME = "note2tabs";
const DEFAULT_FRAMES_PER_BAR = 480;
const DEFAULT_FPS = 240;
const MIDI_TICKS_PER_QUARTER = 480;

const toSafeInt = (value: unknown, fallback: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.round(num);
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const xmlEscape = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const sanitizeExportFilename = (name?: string | null) => {
  const safe = String(name || DEFAULT_FILENAME)
    .trim()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return safe || DEFAULT_FILENAME;
};

const getFramesPerBar = (snapshot: EditorSnapshot) =>
  Math.max(1, toSafeInt(snapshot.framesPerMessure, DEFAULT_FRAMES_PER_BAR));

const getFps = (snapshot: EditorSnapshot) => Math.max(1, toSafeInt(snapshot.fps, DEFAULT_FPS));

const getMidiFromTab = (snapshot: EditorSnapshot, tab: TabCoord, fallback?: number) => {
  const direct = snapshot.tabRef?.[tab[0]]?.[tab[1]];
  if (Number.isFinite(Number(direct))) return Math.round(Number(direct));
  if (Number.isFinite(Number(fallback)) && Number(fallback) > 0) return Math.round(Number(fallback));
  return 40 + (5 - clamp(toSafeInt(tab[0], 0), 0, 5)) * 5 + clamp(toSafeInt(tab[1], 0), 0, 36);
};

type ExportNoteEvent = {
  startFrame: number;
  lengthFrames: number;
  midi: number;
  tab: TabCoord;
};

const collectNoteEvents = (snapshot: EditorSnapshot): ExportNoteEvent[] => {
  const events: ExportNoteEvent[] = [];
  snapshot.notes.forEach((note) => {
    const tab = [toSafeInt(note.tab?.[0], 0), toSafeInt(note.tab?.[1], 0)] as TabCoord;
    events.push({
      startFrame: Math.max(0, toSafeInt(note.startTime, 0)),
      lengthFrames: Math.max(1, toSafeInt(note.length, 1)),
      midi: getMidiFromTab(snapshot, tab, note.midiNum),
      tab,
    });
  });
  snapshot.chords.forEach((chord) => {
    chord.currentTabs.forEach((rawTab, index) => {
      const tab = [toSafeInt(rawTab?.[0], 0), toSafeInt(rawTab?.[1], 0)] as TabCoord;
      events.push({
        startFrame: Math.max(0, toSafeInt(chord.startTime, 0)),
        lengthFrames: Math.max(1, toSafeInt(chord.length, 1)),
        midi: getMidiFromTab(snapshot, tab, chord.originalMidi?.[index]),
        tab,
      });
    });
  });
  return events.sort((a, b) => a.startFrame - b.startFrame || a.midi - b.midi || a.tab[0] - b.tab[0]);
};

const midiToPitch = (midi: number) => {
  const names = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"];
  const alters = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  const safeMidi = clamp(toSafeInt(midi, 60), 0, 127);
  const pitchClass = safeMidi % 12;
  return {
    step: names[pitchClass],
    alter: alters[pitchClass],
    octave: Math.floor(safeMidi / 12) - 1,
  };
};

export const buildNote2TabsExportJson = (snapshot: EditorSnapshot) =>
  JSON.stringify(
    {
      format: "note2tabs-editor",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      editor: snapshot,
    },
    null,
    2
  );

export const buildMusicXmlFromSnapshot = (snapshot: EditorSnapshot) => {
  const title = snapshot.name || "Note2Tabs export";
  const framesPerBar = getFramesPerBar(snapshot);
  const beatsPerBar = Math.max(1, toSafeInt(snapshot.timeSignature, 4));
  const divisions = framesPerBar;
  const events = collectNoteEvents(snapshot);
  const totalFrames = Math.max(
    framesPerBar,
    toSafeInt(snapshot.totalFrames, framesPerBar),
    ...events.map((event) => event.startFrame + event.lengthFrames)
  );
  const totalBars = Math.max(1, Math.ceil(totalFrames / framesPerBar));
  const measures = Array.from({ length: totalBars }, (_, index) =>
    events.filter((event) => Math.floor(event.startFrame / framesPerBar) === index)
  );

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="3.1">',
    `  <work><work-title>${xmlEscape(title)}</work-title></work>`,
    "  <part-list>",
    '    <score-part id="P1"><part-name>Guitar</part-name></score-part>',
    "  </part-list>",
    '  <part id="P1">',
  ];

  measures.forEach((measureEvents, measureIndex) => {
    const sorted = [...measureEvents].sort((a, b) => a.startFrame - b.startFrame || a.midi - b.midi);
    let cursor = measureIndex * framesPerBar;
    lines.push(`    <measure number="${measureIndex + 1}">`);
    if (measureIndex === 0) {
      lines.push("      <attributes>");
      lines.push(`        <divisions>${divisions}</divisions>`);
      lines.push("        <key><fifths>0</fifths></key>");
      lines.push(`        <time><beats>${beatsPerBar}</beats><beat-type>4</beat-type></time>`);
      lines.push("        <clef><sign>TAB</sign><line>5</line></clef>");
      lines.push("      </attributes>");
    }
    sorted.forEach((event) => {
      if (event.startFrame > cursor) {
        lines.push("      <note>");
        lines.push("        <rest/>");
        lines.push(`        <duration>${event.startFrame - cursor}</duration>`);
        lines.push("        <type>quarter</type>");
        lines.push("      </note>");
      }
      const pitch = midiToPitch(event.midi);
      const isChordTone = event.startFrame === cursor;
      lines.push("      <note>");
      if (isChordTone) lines.push("        <chord/>");
      lines.push("        <pitch>");
      lines.push(`          <step>${pitch.step}</step>`);
      if (pitch.alter) lines.push(`          <alter>${pitch.alter}</alter>`);
      lines.push(`          <octave>${pitch.octave}</octave>`);
      lines.push("        </pitch>");
      lines.push(`        <duration>${event.lengthFrames}</duration>`);
      lines.push("        <type>quarter</type>");
      lines.push("        <notations>");
      lines.push("          <technical>");
      lines.push(`            <string>${event.tab[0] + 1}</string>`);
      lines.push(`            <fret>${event.tab[1]}</fret>`);
      lines.push("          </technical>");
      lines.push("        </notations>");
      lines.push("      </note>");
      cursor = Math.max(cursor, event.startFrame + event.lengthFrames);
    });
    const measureEnd = (measureIndex + 1) * framesPerBar;
    if (cursor < measureEnd) {
      lines.push("      <note>");
      lines.push("        <rest/>");
      lines.push(`        <duration>${measureEnd - cursor}</duration>`);
      lines.push("        <type>quarter</type>");
      lines.push("      </note>");
    }
    lines.push("    </measure>");
  });

  lines.push("  </part>", "</score-partwise>");
  return lines.join("\n");
};

const writeUint32 = (value: number) => [
  (value >> 24) & 0xff,
  (value >> 16) & 0xff,
  (value >> 8) & 0xff,
  value & 0xff,
];

const writeUint16 = (value: number) => [(value >> 8) & 0xff, value & 0xff];

const writeStringBytes = (value: string) => Array.from(value, (char) => char.charCodeAt(0) & 0xff);

const writeVariableLength = (value: number) => {
  let buffer = value & 0x7f;
  const bytes = [];
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  for (;;) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return bytes;
};

export const buildMidiFromSnapshot = (snapshot: EditorSnapshot) => {
  const framesPerBar = getFramesPerBar(snapshot);
  const fps = getFps(snapshot);
  const beatsPerBar = Math.max(1, toSafeInt(snapshot.timeSignature, 4));
  const tempoMicroseconds = Math.max(1, Math.round((60 * 1_000_000 * beatsPerBar * fps) / framesPerBar));
  const frameToTick = (frame: number) => Math.max(0, Math.round((frame / framesPerBar) * beatsPerBar * MIDI_TICKS_PER_QUARTER));
  const events: Array<{ tick: number; bytes: number[]; order: number }> = [
    { tick: 0, bytes: [0xff, 0x51, 0x03, (tempoMicroseconds >> 16) & 0xff, (tempoMicroseconds >> 8) & 0xff, tempoMicroseconds & 0xff], order: 0 },
    { tick: 0, bytes: [0xff, 0x58, 0x04, beatsPerBar & 0xff, 0x02, 0x18, 0x08], order: 1 },
  ];
  collectNoteEvents(snapshot).forEach((event) => {
    const startTick = frameToTick(event.startFrame);
    const endTick = Math.max(startTick + 1, frameToTick(event.startFrame + event.lengthFrames));
    const midi = clamp(toSafeInt(event.midi, 60), 0, 127);
    events.push({ tick: startTick, bytes: [0x90, midi, 90], order: 2 });
    events.push({ tick: endTick, bytes: [0x80, midi, 0], order: 1 });
  });
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const track: number[] = [];
  let previousTick = 0;
  events.forEach((event) => {
    track.push(...writeVariableLength(Math.max(0, event.tick - previousTick)), ...event.bytes);
    previousTick = event.tick;
  });
  track.push(0x00, 0xff, 0x2f, 0x00);

  return new Uint8Array([
    ...writeStringBytes("MThd"),
    ...writeUint32(6),
    ...writeUint16(0),
    ...writeUint16(1),
    ...writeUint16(MIDI_TICKS_PER_QUARTER),
    ...writeStringBytes("MTrk"),
    ...writeUint32(track.length),
    ...track,
  ]);
};

export function buildGteExportFile(snapshot: EditorSnapshot, format: GteExportFormat): GteExportFile {
  const baseName = sanitizeExportFilename(snapshot.name);
  if (format === "json") {
    return {
      filename: `${baseName}.note2tabs.json`,
      mimeType: "application/json",
      content: buildNote2TabsExportJson(snapshot),
    };
  }
  if (format === "musicxml") {
    return {
      filename: `${baseName}.musicxml`,
      mimeType: "application/vnd.recordare.musicxml+xml",
      content: buildMusicXmlFromSnapshot(snapshot),
    };
  }
  if (format === "midi") {
    return {
      filename: `${baseName}.mid`,
      mimeType: "audio/midi",
      content: buildMidiFromSnapshot(snapshot),
    };
  }
  return {
    filename: `${baseName}.txt`,
    mimeType: "text/plain",
    content: buildTabTextFromSnapshot(snapshot),
  };
}

export function downloadGteExportFile(file: GteExportFile) {
  let blobContent: string | ArrayBuffer;
  if (typeof file.content === "string") {
    blobContent = file.content;
  } else {
    blobContent = new ArrayBuffer(file.content.byteLength);
    new Uint8Array(blobContent).set(file.content);
  }
  const blob = new Blob([blobContent], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
