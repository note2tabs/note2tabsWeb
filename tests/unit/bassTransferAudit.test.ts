import { describe, expect, it } from "vitest";
import type { EditorSnapshot } from "../../types/gte";
import { buildGteExportFile, buildMidiFromSnapshot, buildMusicXmlFromSnapshot } from "../../lib/gteTabExport";
import { parseMidiTabImport } from "../../lib/gteTabImport";
import { getTabMidi } from "../../lib/gteTuning";

const bass: EditorSnapshot = {
  id: "audit-bass", name: "Audit", trackType: "bass", editorType: "bass",
  framesPerMessure: 480, fps: 240, secondsPerBar: 2, totalFrames: 480,
  notes: [
    { id: 1, startTime: 0, length: 120, midiNum: 28, tab: [3, 0], optimals: [] },
    { id: 2, startTime: 120, length: 120, midiNum: 33, tab: [2, 0], optimals: [] },
    { id: 3, startTime: 240, length: 120, midiNum: 38, tab: [1, 0], optimals: [] },
    { id: 4, startTime: 360, length: 120, midiNum: 43, tab: [0, 0], optimals: [] },
  ],
  chords: [], cutPositionsWithCoords: [[[0, 480], [2, 0]]], optimalsByTime: {}, maxFret: 22,
  tuning: { presetId: "bass-standard", openStringMidi: [43, 38, 33, 28], capo: 0 },
};

describe("four-string bass transfer audit", () => {
  it("round-trips standard-bass MIDI at concert pitch and keeps bass identity", () => {
    const midi = buildMidiFromSnapshot(bass);
    const track = parseMidiTabImport(midi.slice().buffer).tracks?.[0];
    expect(track?.trackType).toBe("bass");
    expect(track?.stamps.map(([, tab]) => getTabMidi(bass, tab))).toEqual([28, 33, 38, 43]);
  });
  it("exports MusicXML as bass with four staff lines and correct pitch", () => {
    const xml = buildMusicXmlFromSnapshot(bass);
    expect(xml).toContain("<part-name>Bass</part-name>");
    expect(xml).toContain("<staff-lines>4</staff-lines>");
    expect(xml).toContain("<step>E</step>");
    expect(xml).toContain("<octave>1</octave>");
    expect(xml).toContain('<staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>1</tuning-octave></staff-tuning>');
    expect(xml).toContain('<staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>');
  });
  it("keeps all four string labels in text and preserves native project tuning", () => {
    const text = buildGteExportFile(bass, "txt").content as string;
    const labels = text.split("\n").filter(line => /^[GDAE]\|/.test(line)).map(line => line[0]);
    expect(labels).toEqual(["G", "D", "A", "E"]);
    const json = JSON.parse(buildGteExportFile(bass, "json").content as string);
    expect(json.editor.trackType).toBe("bass");
    expect(json.editor.tuning.openStringMidi).toEqual([43, 38, 33, 28]);
  });
});
