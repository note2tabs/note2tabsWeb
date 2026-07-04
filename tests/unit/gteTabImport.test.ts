import { describe, expect, it } from "vitest";
import {
  TAB_IMPORT_MAX_TEXT_FILE_SIZE_BYTES,
  TAB_IMPORT_MAX_TEXT_CHARS,
  getImportNameFromFile,
  getUnsupportedTabImportMessage,
  parseMidiTabImport,
  parseTabImportFile,
  parseMusicXmlTabImport,
  parseTextTabImport,
} from "../../lib/gteTabImport";

const asciiTab = `e|--0--|
B|--1--|
G|--0--|
D|--2--|
A|--3--|
E|-----|`;

function bytesToArrayBuffer(bytes: number[]) {
  const array = Uint8Array.from(bytes);
  return array.buffer.slice(array.byteOffset, array.byteOffset + array.byteLength);
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
    const xml = `
      <score-partwise>
        <part>
          <measure>
            <note>
              <pitch><step>E</step><octave>4</octave></pitch>
              <notations><technical><string>1</string><fret>0</fret></technical></notations>
            </note>
            <note>
              <pitch><step>C</step><octave>4</octave></pitch>
              <notations><technical><string>2</string><fret>1</fret></technical></notations>
            </note>
          </measure>
        </part>
      </score-partwise>`;

    const parsed = parseMusicXmlTabImport(xml);
    expect(parsed.text).toContain("e|0");
    expect(parsed.text).toContain("B|");
    expect(parsed.stamps).toEqual(
      expect.arrayContaining([
        [0, [0, 0], 120],
        [120, [1, 1], 120],
      ])
    );
  });

  it("parses simple MIDI note-on and note-off events into ASCII tab", () => {
    const midi = bytesToArrayBuffer([
      0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
      0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x0c, 0x00, 0x90, 0x40, 0x40, 0x83, 0x60,
      0x80, 0x40, 0x00, 0x00, 0xff, 0x2f, 0x00,
    ]);

    const parsed = parseMidiTabImport(midi);
    expect(parsed.text).toContain("e|0");
    expect(parsed.stamps[0]).toEqual([0, [0, 0], 120]);
  });

  it("reports recognized Guitar Pro files as needing conversion", () => {
    expect(getUnsupportedTabImportMessage("song.gp5")).toContain("recognized");
  });
});
