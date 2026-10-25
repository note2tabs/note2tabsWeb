import { afterEach, describe, expect, it, vi } from "vitest";
import { parseMusicXmlTabImport, parseMidiTabImport } from "../../lib/gteTabImport";
import { applyImportTrackToLane } from "../../components/GteFileImportButton";
import { assignVoices } from "../../lib/gteAssignVoices";
import { buildNotationMusicXml } from "../../lib/gteNotationExport";
import { optimizeImportedTrackFingerings } from "../../lib/gteApi";
import { restorePitchedImport } from "../../lib/gteNotationImport";
import { synthesizeTimingMap } from "../../lib/gteTiming";
import { editMidiEvents } from "../../lib/gteMidi";
import { setScoreVoice, scoreEvents } from "../../lib/gteNotation";
import { serializeNotationSnapshot, restoreNotationSnapshot } from "../../lib/gteNotationPersistence";
import type { EditorSnapshot } from "../../types/gte";
const lane = (): EditorSnapshot => ({ id: "piano", instrumentType: "notation", instrumentId: "gm:piano", framesPerMessure: 480, totalFrames: 960, fps: 240, timeSignature: 4, timeSignatureBottom: 4, notes: [], chords: [], cutPositionsWithCoords: [], optimalsByTime: {} });
const pitch = (step: string, octave = 4) => `<pitch><step>${step}</step><octave>${octave}</octave></pitch>`;
const xml = (content: string) => `<score-partwise><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${content}</measure></part></score-partwise>`;
afterEach(() => vi.unstubAllGlobals());
describe("voice assignment through real import adapters", () => {
  it("maps arbitrary MusicXML voice IDs separately per staff, retaining pitches, rests, ties and chord onsets", () => {
    const parsed = parseMusicXmlTabImport(xml(`<note>${pitch("C")}<duration>1</duration><voice>upper-line</voice><staff>1</staff><tie type="start"/></note>
      <note><chord/>${pitch("E")}<duration>1</duration><voice>upper-line</voice><staff>1</staff></note>
      <note>${pitch("C")}<duration>1</duration><voice>upper-line</voice><staff>1</staff><tie type="stop"/></note>
      <note><rest/><duration>2</duration><voice>upper-line</voice><staff>1</staff></note>
      <backup><duration>4</duration></backup><note>${pitch("G", 3)}<duration>4</duration><voice>held</voice><staff>1</staff></note>
      <backup><duration>4</duration></backup><note>${pitch("C", 2)}<duration>4</duration><voice>bass-id-7</voice><staff>2</staff></note>`));
    const imported = applyImportTrackToLane(lane(), parsed.tracks![0]);
    expect(imported.notes.map(note => [note.midiNum, note.startTime, note.length, note.notationVoice, note.notationStaff])).toEqual([
      [64, 0, 120, 1, "treble"], [36, 0, 480, 1, "bass"], [60, 0, 120, 1, "treble"], [55, 0, 480, 2, "treble"], [60, 120, 120, 1, "treble"],
    ]);
    expect(imported.notation?.rests).toHaveLength(1);
    expect(imported.notation?.ties).toEqual([{ from: "n:3", to: "n:5" }]);
    expect(assignVoices({ track: imported, preserveExisting: false }).track).toBe(imported);
  });
  it("assigns missing MusicXML voices and reports more than two voices without dropping pitches", () => {
    const missing = parseMusicXmlTabImport(xml(`<note>${pitch("C", 3)}<duration>4</duration></note><backup><duration>4</duration></backup><note>${pitch("E")}<duration>1</duration></note><note>${pitch("F")}<duration>1</duration></note>`));
    const result = assignVoices({ track: applyImportTrackToLane(lane(), missing.tracks![0]) });
    expect(result.track.notes.find(note => note.midiNum === 48)?.notationVoice).toBe(2);
    const extra = parseMusicXmlTabImport(xml(["alpha", "beta", "gamma"].map((voice, i) => `<note>${pitch(["C", "E", "G"][i])}<duration>1</duration><voice>${voice}</voice></note><backup><duration>1</duration></backup>`).join("")));
    expect(extra.warning).toContain("more than two voices");
    const imported = applyImportTrackToLane(lane(), extra.tracks![0]), assigned = assignVoices({ track: imported });
    expect(assigned.track.notes).toHaveLength(3); expect(assigned.warnings[0]).toContain("more than two voices");
  });
  it("retains low/high MIDI notes and assigns missing voices after normalization", () => {
    const bytes = Uint8Array.from([77,84,104,100,0,0,0,6,0,0,0,1,0,96,77,84,114,107,0,0,0,20,
      0,0x90,21,100,0,0x90,108,100,96,0x80,21,0,0,0x80,108,0,0,0xff,0x2f,0]);
    const parsed = parseMidiTabImport(bytes.buffer), imported = applyImportTrackToLane(lane(), parsed.tracks![0]);
    const result = assignVoices({ track: imported });
    expect(result.track.notes.map(note => note.midiNum).sort((a,b) => a-b)).toEqual([21,108]);
    expect(result.track.notes.every(note => note.notationVoice !== undefined)).toBe(true);
  });
  it("uses final transcription timing and persists voices without changing existing tracks", async () => {
    const restored = restorePitchedImport(lane(), [{ pitch_midi: 48, start_time_s: 0, end_time_s: 2 },
      ...[64,65,67,69].map((pitch, i) => ({ pitch_midi: pitch, start_time_s: i / 2, end_time_s: (i + 1) / 2 }))], synthesizeTimingMap(2, 960, 4, 4));
    const existing = { ...structuredClone(restored), id: "existing" }, before = structuredClone(restored);
    let saved: any;
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => { saved = JSON.parse(String(init.body)).snapshot; return new Response(JSON.stringify({ ok: true, snapshot: saved })); }));
    const result = await optimizeImportedTrackFingerings("song", { id: "song", editors: [existing, restored] }, 1, [restored.id]);
    expect(result.editors[0]).toEqual(existing);
    expect(result.editors[1].notes[0].notationVoice).toBe(2);
    expect(result.editors[1].notes.map(({ notationVoice, notationVoiceSource, ...note }) => note)).toEqual(before.notes);
    expect(saved.editors[1].chordEditor.notation.assignments["n:1"]).toMatchObject({ voice: 2, source: "auto" });
  });
  it("round-trips both staff voices and cross-bar ties in notation MusicXML", () => {
    const source = lane(); source.notes = [
      { id: 1, startTime: 0, length: 600, midiNum: 64, tab: [0,0], optimals: [], notationVoice: 2, notationStaff: "treble" },
      { id: 2, startTime: 0, length: 120, midiNum: 76, tab: [0,0], optimals: [], notationVoice: 1, notationStaff: "treble" },
      { id: 3, startTime: 0, length: 480, midiNum: 36, tab: [0,0], optimals: [], notationVoice: 1, notationStaff: "bass" },
    ];
    const exported = buildNotationMusicXml(source), parsed = parseMusicXmlTabImport(exported);
    const imported = applyImportTrackToLane(lane(), parsed.tracks![0]);
    expect(imported.notation?.ties?.length).toBeGreaterThan(0);
    expect(imported.notes.filter(note => note.midiNum === 64).every(note => note.notationVoice === 2 && note.notationStaff === "treble")).toBe(true);
    expect(imported.notes.some(note => note.midiNum === 36 && note.notationStaff === "bass")).toBe(true);
    expect(imported.notes.filter(note => note.midiNum === 64).reduce((sum,note) => sum + note.length,0)).toBe(600);
  });
  it("preserves locks on chord members through MIDI edits and save/reopen", () => {
    const source = lane(); source.chords = [{ id: 9, startTime: 0, length: 120, originalMidi: [64,67], currentTabs: [[0,0],[1,0]], ogTabs: [], notationVoice: 2, notationVoiceSource: "manual", notationVoiceLocked: true }];
    const edited = editMidiEvents(source, ["c:9:0"], { transpose: 1 });
    expect(edited.notes.every(note => note.notationVoiceLocked && note.notationVoiceSource === "manual")).toBe(true);
    const wire = serializeNotationSnapshot(edited), reopened = restoreNotationSnapshot({ ...wire, notation: undefined });
    expect(assignVoices({ track: reopened, preserveExisting: false }).changed).toBe(false);
    const manual = setScoreVoice(reopened, { noteIds: [edited.notes[0].id], chordIds: [] }, 1);
    expect(scoreEvents(manual)[0].voice).toBe(1);
  });
});
