import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import {
  TAB_IMPORT_MAX_TEXT_FILE_SIZE_BYTES,
  TAB_IMPORT_MAX_TEXT_CHARS,
  getImportNameFromFile,
  getUnsupportedTabImportMessage,
  parseCompressedMusicXmlTabImport,
  parseMidiTabImport,
  parseTabImportFile,
  parseMusicXmlTabImport,
  parseTextTabImport,
} from "../../lib/gteTabImport";
import { buildMusicXmlFromSnapshot } from "../../lib/gteTabExport";

const asciiTab = `e|--0--|
B|--1--|
G|--0--|
D|--2--|
A|--3--|
E|-----|`;

const musicXml = `
  <score-partwise>
    <part id="P1">
      <measure number="1">
        <attributes>
          <divisions>4</divisions>
          <time><beats>4</beats><beat-type>4</beat-type></time>
        </attributes>
        <note>
          <pitch><step>E</step><octave>4</octave></pitch>
          <duration>4</duration>
          <notations><technical><string>1</string><fret>0</fret></technical></notations>
        </note>
        <note>
          <chord/>
          <pitch><step>C</step><octave>4</octave></pitch>
          <duration>4</duration>
          <notations><technical><string>2</string><fret>1</fret></technical></notations>
        </note>
        <note>
          <rest/>
          <duration>4</duration>
        </note>
        <note>
          <pitch><step>D</step><octave>4</octave></pitch>
          <duration>8</duration>
          <notations><technical><string>3</string><fret>2</fret></technical></notations>
        </note>
      </measure>
      <measure number="2">
        <attributes>
          <divisions>8</divisions>
          <time><beats>4</beats><beat-type>4</beat-type></time>
        </attributes>
        <note>
          <pitch><step>G</step><octave>3</octave></pitch>
          <duration>8</duration>
          <notations><technical><string>4</string><fret>0</fret></technical></notations>
        </note>
      </measure>
    </part>
  </score-partwise>`;

const pitchedMusicXml = `
  <score-partwise>
    <part id="P1">
      <measure number="1">
        <attributes>
          <divisions>4</divisions>
          <time><beats>4</beats><beat-type>4</beat-type></time>
        </attributes>
        <note>
          <pitch><step>A</step><octave>4</octave></pitch>
          <duration>4</duration>
        </note>
        <note>
          <pitch><step>G</step><alter>1</alter><octave>4</octave></pitch>
          <duration>4</duration>
        </note>
      </measure>
    </part>
  </score-partwise>`;

const compressedMusicXmlBytes = () =>
  zipSync({
    "META-INF/container.xml": new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
      <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <rootfiles>
          <rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/>
        </rootfiles>
      </container>`),
    "score.musicxml": new TextEncoder().encode(musicXml),
  });

const simpleMidiBytes = [
  0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
  0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x0c, 0x00, 0x90, 0x40, 0x40, 0x83, 0x60,
  0x80, 0x40, 0x00, 0x00, 0xff, 0x2f, 0x00,
];

const multiTrackMidiBytes = [
  0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x01, 0x00, 0x03, 0x01, 0xe0,
  0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x04, 0x00, 0xff, 0x2f, 0x00,
  0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x17, 0x00, 0xff, 0x03, 0x06, 0x4c, 0x65, 0x61,
  0x64, 0x20, 0x31, 0x00, 0x90, 0x40, 0x40, 0x83, 0x60, 0x80, 0x40, 0x00, 0x00, 0xff, 0x2f,
  0x00,
  0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x17, 0x00, 0xff, 0x03, 0x06, 0x42, 0x61, 0x73,
  0x73, 0x20, 0x31, 0x00, 0x90, 0x2d, 0x40, 0x81, 0x70, 0x80, 0x2d, 0x00, 0x00, 0xff, 0x2f,
  0x00,
];

const mergedChannelMidiBytes = [
  0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
  0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x1b, 0x00, 0xc0, 0x00, 0x00, 0xc1, 0x20,
  0x00, 0x90, 0x40, 0x40, 0x00, 0x91, 0x2d, 0x40, 0x83, 0x60, 0x80, 0x40, 0x00, 0x00,
  0x81, 0x2d, 0x00, 0x00, 0xff, 0x2f, 0x00,
];

function bytesToArrayBuffer(bytes: number[]) {
  const array = Uint8Array.from(bytes);
  return array.buffer.slice(array.byteOffset, array.byteOffset + array.byteLength);
}

const comparableImport = (parsed: Awaited<ReturnType<typeof parseTabImportFile>>) => ({
  text: parsed.text,
  stamps: parsed.stamps,
  framesPerMessure: parsed.framesPerMessure,
  fps: parsed.fps,
  totalFrames: parsed.totalFrames,
  tracks: parsed.tracks,
  warning: parsed.warning,
  name: parsed.name,
  fileName: parsed.fileName,
});

async function expectDeterministicFileImport(file: File) {
  const first = comparableImport(await parseTabImportFile(file));
  for (let index = 0; index < 5; index += 1) {
    await expect(parseTabImportFile(file).then(comparableImport)).resolves.toEqual(first);
  }
  return first;
}

describe("gte tab import helpers", () => {
  it("normalizes pasted text tab content", () => {
    const parsed = parseTextTabImport(`\r\n${asciiTab}\r\n`);
    expect(parsed.text).toBe(asciiTab);
    expect(parsed.stamps.length).toBeGreaterThan(0);
    expect(parsed.totalFrames).toBeGreaterThan(0);
  });

  it("rejects random text files that do not look like guitar tabs", () => {
    expect(() =>
      parseTextTabImport("sessionid=abc123\ncsrftoken=secret\nanalytics_id=tracking-value")
    ).toThrow("six-string guitar tab");
  });

  it("rejects oversized text files before parsing them", async () => {
    const file = new File(["x".repeat(TAB_IMPORT_MAX_TEXT_FILE_SIZE_BYTES + 1)], "cookies.txt", {
      type: "text/plain",
    });

    await expect(parseTabImportFile(file)).rejects.toThrow("too large");
  });

  it("rejects pasted text tabs that exceed safe import length", () => {
    const hugeTab = `${asciiTab}\n${"e|0|\n".repeat(Math.ceil(TAB_IMPORT_MAX_TEXT_CHARS / 4))}`;
    expect(() => parseTextTabImport(hugeTab)).toThrow("too long");
  });

  it("uses the filename stem as the default import name", () => {
    expect(getImportNameFromFile("/tmp/Blackbird.gp5")).toBe("Blackbird");
  });

  it("parses MusicXML technical string and fret notation into ASCII tab", () => {
    const parsed = parseMusicXmlTabImport(musicXml);
    expect(parsed.text).toContain("e|0");
    expect(parsed.text).toContain("B|");
    expect(parsed.stamps).toEqual(
      [
        [0, [0, 0], 120],
        [0, [1, 1], 120],
        [240, [2, 2], 240],
        [480, [3, 0], 120],
      ]
    );
  });

  it("parses simple MIDI note-on and note-off events into ASCII tab", () => {
    const midi = bytesToArrayBuffer(simpleMidiBytes);

    const parsed = parseMidiTabImport(midi);
    expect(parsed.text).toContain("e|0");
    expect(parsed.stamps[0]).toEqual([0, [0, 0], 120]);
  });

  it("falls back to pitch-derived tabs when MusicXML has no tablature data", () => {
    const parsed = parseMusicXmlTabImport(pitchedMusicXml);
    expect(parsed.stamps).toEqual([
      [0, [0, 5], 120],
      [120, [0, 4], 120],
    ]);
  });

  it("keeps instrumental MIDI tracks separate", () => {
    const parsed = parseMidiTabImport(bytesToArrayBuffer(multiTrackMidiBytes));

    expect(parsed.tracks).toHaveLength(2);
    expect(parsed.tracks?.[0]).toMatchObject({
      name: "Lead 1 Ch 1",
      stamps: [[0, [0, 0], 120]],
    });
    expect(parsed.tracks?.[1]).toMatchObject({
      name: "Bass 1 Ch 1",
      stamps: [[0, [4, 0], 60]],
    });
    expect(parsed.stamps).toEqual([
      [0, [0, 0], 120],
      [0, [4, 0], 60],
    ]);
  });

  it("splits merged MIDI tracks by instrumental channel", () => {
    const parsed = parseMidiTabImport(bytesToArrayBuffer(mergedChannelMidiBytes));

    expect(parsed.tracks).toHaveLength(2);
    expect(parsed.tracks?.[0]).toMatchObject({
      name: "Ch 1 program 1",
      stamps: [[0, [0, 0], 120]],
    });
    expect(parsed.tracks?.[1]).toMatchObject({
      name: "Ch 2 program 33",
      stamps: [[0, [4, 0], 120]],
    });
  });

  it("imports ASCII text-like formats deterministically", async () => {
    for (const extension of ["txt", "tab", "asc"]) {
      const result = await expectDeterministicFileImport(new File([asciiTab], `deterministic.${extension}`));
      expect(result.stamps).toEqual([
        [192, [0, 0], 96],
        [192, [1, 1], 96],
        [192, [2, 0], 96],
        [192, [3, 2], 96],
        [192, [4, 3], 96],
      ]);
    }
  });

  it("imports MusicXML formats deterministically", async () => {
    for (const extension of ["xml", "musicxml"]) {
      const result = await expectDeterministicFileImport(new File([musicXml], `deterministic.${extension}`));
      expect(result.stamps).toEqual([
        [0, [0, 0], 120],
        [0, [1, 1], 120],
        [240, [2, 2], 240],
        [480, [3, 0], 120],
      ]);
      expect(result.text).toContain("e|0");
      expect(result.text).toContain("G|");
    }
  });

  it("imports compressed MusicXML files", async () => {
    const parsed = parseCompressedMusicXmlTabImport(bytesToArrayBuffer(Array.from(compressedMusicXmlBytes())));
    expect(parsed.stamps).toEqual([
      [0, [0, 0], 120],
      [0, [1, 1], 120],
      [240, [2, 2], 240],
      [480, [3, 0], 120],
    ]);

    const fileResult = await parseTabImportFile(
      new File([bytesToArrayBuffer(Array.from(compressedMusicXmlBytes()))], "compressed.mxl")
    );
    expect(fileResult.stamps).toEqual(parsed.stamps);
  });

  it("round-trips exported MusicXML chord notes without staggering them", () => {
    const xml = buildMusicXmlFromSnapshot({
      id: "roundtrip",
      name: "Roundtrip",
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      timeSignature: 4,
      timeSignatureBottom: 4,
      framesPerMessure: 480,
      fps: 240,
      totalFrames: 480,
      secondsPerBar: 2,
      notes: [
        { id: 1, startTime: 0, length: 480, midiNum: 42, tab: [5, 2], optimals: [] },
        { id: 2, startTime: 0, length: 120, midiNum: 54, tab: [3, 4], optimals: [] },
        { id: 3, startTime: 0, length: 120, midiNum: 57, tab: [2, 2], optimals: [] },
        { id: 4, startTime: 120, length: 120, midiNum: 61, tab: [1, 2], optimals: [] },
      ],
      chords: [],
      noteEffects: [],
      cutPositionsWithCoords: [],
      optimalsByTime: {},
      tabRef: [],
    } as any);

    const parsed = parseMusicXmlTabImport(xml);
    expect(parsed.stamps).toEqual(
      expect.arrayContaining([
        [0, [5, 2], 480],
        [0, [3, 4], 120],
        [0, [2, 2], 120],
        [120, [1, 2], 120],
      ])
    );
  });

  it("imports MIDI formats deterministically", async () => {
    for (const extension of ["mid", "midi"]) {
      const result = await expectDeterministicFileImport(
        new File([bytesToArrayBuffer(simpleMidiBytes)], `deterministic.${extension}`)
      );
      expect(result.stamps).toEqual([[0, [0, 0], 120]]);
      expect(result.text).toContain("e|0");
    }
  });

  it("rejects recognized wrapper or converter formats consistently when no browser parser is available", async () => {
    for (const extension of ["ptb", "tef", "tg"]) {
      const file = new File([new Uint8Array([1, 2, 3, 4])], `unsupported.${extension}`);
      await expect(parseTabImportFile(file)).rejects.toThrow();
    }
  });

  it("reports recognized Guitar Pro files as needing conversion", () => {
    expect(getUnsupportedTabImportMessage("song.gp5")).toContain("recognized");
  });
});
