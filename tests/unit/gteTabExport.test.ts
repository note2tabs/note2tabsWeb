import { describe, expect, it } from "vitest";
import { buildMidiFromSnapshot, buildMusicXmlFromSnapshot, buildGteExportFile, sanitizeExportFilename } from "../../lib/gteTabExport";
import { buildTabRefForTuning } from "../../lib/gteTuning";
import type { EditorSnapshot } from "../../types/gte";

const snapshot = (): EditorSnapshot => ({
  id: "ed-1",
  name: "My Song!.gp5",
  framesPerMessure: 480,
  fps: 240,
  totalFrames: 960,
  secondsPerBar: 2,
  timeSignature: 4,
  notes: [
    { id: 1, startTime: 0, length: 120, midiNum: 64, tab: [0, 3], optimals: [] },
    { id: 2, startTime: 240, length: 120, midiNum: 59, tab: [1, 5], optimals: [] },
  ],
  chords: [
    {
      id: 1,
      startTime: 480,
      length: 240,
      originalMidi: [52, 59],
      currentTabs: [
        [3, 2],
        [1, 5],
      ],
      ogTabs: [
        [3, 2],
        [1, 5],
      ],
    },
  ],
  noteEffects: [],
  cutPositionsWithCoords: [[[0, 960], [2, 0]]],
  optimalsByTime: {},
  tabRef: buildTabRefForTuning([64, 59, 55, 50, 45, 40], 0, 22),
});

describe("gteTabExport", () => {
  it("sanitizes exported filenames", () => {
    expect(sanitizeExportFilename("My Song!.gp5")).toBe("My-Song");
    expect(sanitizeExportFilename("   ")).toBe("note2tabs");
  });

  it("builds MusicXML with note pitch and tab technical data", () => {
    const xml = buildMusicXmlFromSnapshot(snapshot());

    expect(xml).toContain("<score-partwise");
    expect(xml).toContain("<work-title>My Song!.gp5</work-title>");
    expect(xml).toContain("<step>E</step>");
    expect(xml).toContain("<string>1</string>");
    expect(xml).toContain("<fret>3</fret>");
  });

  it("builds a standard MIDI file", () => {
    const midi = buildMidiFromSnapshot(snapshot());
    const header = String.fromCharCode(...midi.slice(0, 4));
    const trackHeader = String.fromCharCode(...midi.slice(14, 18));

    expect(header).toBe("MThd");
    expect(trackHeader).toBe("MTrk");
    expect(midi.length).toBeGreaterThan(30);
  });

  it("builds file payloads for supported export formats", () => {
    expect(buildGteExportFile(snapshot(), "txt")).toMatchObject({
      filename: "My-Song.txt",
      mimeType: "text/plain",
    });
    expect(buildGteExportFile(snapshot(), "json")).toMatchObject({
      filename: "My-Song.note2tabs.json",
      mimeType: "application/json",
    });
    expect(buildGteExportFile(snapshot(), "musicxml")).toMatchObject({
      filename: "My-Song.musicxml",
    });
    expect(buildGteExportFile(snapshot(), "midi")).toMatchObject({
      filename: "My-Song.mid",
    });
  });
});
