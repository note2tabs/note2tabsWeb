import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasSnapshot, EditorSnapshot } from "../../types/gte";
const api = vi.hoisted(() => ({ addCanvasEditor: vi.fn(), applySnapshot: vi.fn(), commitEditor: vi.fn() }));
vi.mock("../../lib/gteApi", () => ({ gteApi: api }));
import { editorEntryInstrument, ensureInstrumentEditorEntry } from "../../lib/instrumentEditorEntry";
import { isNotationTrack } from "../../lib/gteNotation";
import { getTabMidi, getTuningPresetsForSnapshot, getTuningPreset } from "../../lib/gteTuning";
import { buildGteExportFile, buildMusicXmlFromSnapshot } from "../../lib/gteTabExport";
import { normalizeGuestSnapshot } from "../../lib/gteGuestDraft";
const guitar = { id: "guitar", name: "Keep my riff", trackType: "tab", instrumentId: "acoustic", notes: [{ id: 7, midiNum: 64 }] };
const blank: EditorSnapshot = { id: "new", version: 1, name: "New", trackType: "tab", editorType: "tab", type: "tab", notes: [], chords: [], cutPositionsWithCoords: [], optimalsByTime: {}, fps: 240, framesPerMessure: 480, totalFrames: 960 };
const canvas = { id: "local", secondsPerBar: 3, editors: [{...guitar, secondsPerBar: 3, timeSignature: 3, timeSignatureBottom: 4 }] } as unknown as CanvasSnapshot;
beforeEach(() => {
  api.addCanvasEditor.mockReset().mockImplementation(async (_id, name, options) => { const editor = { ...blank, instrumentType: "guitar-tab", instrumentId: "acoustic", ...options, name }; return { editor, canvas: { ...canvas, editors: [...canvas.editors, editor] } }; });
  api.applySnapshot.mockReset().mockResolvedValue({ ok: true });
  api.commitEditor.mockReset().mockResolvedValue({ ok: true });
});
describe("instrument-specific editor entry", () => {
  it("accepts only supported explicit instrument choices", () => {
    for (const value of ["piano", "bass", "drums", "ukulele"]) expect(editorEntryInstrument(value)).toBe(value);
    for (const value of ["<script>", ["piano"], undefined, "guitar", "Piano"]) expect(editorEntryInstrument(value)).toBeUndefined();
  });
  it("opens a piano score, preserves guest notes, tempo and meter", async () => {
    const result = await ensureInstrumentEditorEntry("local", canvas, "piano");
    expect(result.editors[0]).toEqual(canvas.editors[0]);
    const piano = result.editors.find(lane => lane.id === result.activeLaneId)!;
    expect(isNotationTrack(piano)).toBe(true);
    expect(piano).toMatchObject({ instrumentType: "notation", instrumentId: "upright_piano", secondsPerBar: 3, timeSignature: 3, timeSignatureBottom: 4 });
  });
  it("keeps the requested track selected when the API response omits activeLaneId", async () => {
    api.applySnapshot.mockImplementationOnce(async (_id, next) => ({ canvas: { ...next, activeLaneId: undefined } }));
    const result = await ensureInstrumentEditorEntry("local", canvas, "piano");
    expect(result.activeLaneId).toBe("new");
    expect(api.commitEditor).not.toHaveBeenCalled();
  });
  it("commits instrument metadata for signed-in projects", async () => {
    await ensureInstrumentEditorEntry("account-project", canvas, "ukulele");
    expect(api.commitEditor).toHaveBeenCalledExactlyOnceWith("account-project");
  });
  it("opens a drum workspace instead of a guitar tab", async () => {
    const result = await ensureInstrumentEditorEntry("local", canvas, "drums");
    expect(result.editors.find(lane => lane.id === result.activeLaneId)).toMatchObject({ trackType: "drums", type: "drums", editorType: "drums", instrumentType: "drums", instrumentId: "drum1" });
  });
  it("reuses the matching existing track without creating duplicates", async () => {
    for (const [instrument, lane] of [["piano", {...blank,instrumentId:"gm:piano"}], ["drums", {...blank, trackType:"drums"}], ["ukulele", {...blank, tuning:{presetId:"ukulele-low-g"}}]] as const) {
      const result = await ensureInstrumentEditorEntry("existing", { ...canvas, editors: [...canvas.editors, lane] } as CanvasSnapshot, instrument);
      expect(result.activeLaneId).toBe("new");
    }
    expect(api.addCanvasEditor).not.toHaveBeenCalled();
  });
  it("deduplicates simultaneous entry requests and retries a failed creation", async () => {
    await Promise.all([ensureInstrumentEditorEntry("parallel", canvas, "piano"), ensureInstrumentEditorEntry("parallel", canvas, "piano")]);
    expect(api.addCanvasEditor).toHaveBeenCalledTimes(1);
    api.addCanvasEditor.mockRejectedValueOnce(new Error("offline"));
    await expect(ensureInstrumentEditorEntry("retry", canvas, "drums")).rejects.toThrow("offline");
    await expect(ensureInstrumentEditorEntry("retry", canvas, "drums")).resolves.toMatchObject({activeLaneId:"new"});
  });
  it("starts ukulele with correct re-entrant pitches and preserves them on guest hydration", async () => {
    const result = await ensureInstrumentEditorEntry("uke", canvas, "ukulele");
    const uke = result.editors.find(lane => lane.id === "new")!;
    expect(uke.tuning?.openStringMidi).toEqual([69,64,60,67]);
    expect([0,1,2,3].map(string => getTabMidi(uke,[string,0]))).toEqual([69,64,60,67]);
    const hydrated = normalizeGuestSnapshot(uke);
    expect(hydrated.tuning?.presetId).toBe("ukulele-high-g");
    expect(hydrated.tuning?.openStringMidi).toEqual([69,64,60,67]);
    expect(getTuningPresetsForSnapshot(hydrated).map(p=>p.id)).toEqual(["ukulele-high-g","ukulele-low-g"]);
    expect(getTuningPreset("ukulele-low-g").openStringMidi).toEqual([69,64,60,55]);
  });
  it("exports a ukulele part with four correctly tuned lines and preserves the project", async () => {
    const result = await ensureInstrumentEditorEntry("export", canvas, "ukulele");
    const uke = result.editors.find(lane => lane.id === "new")!;
    uke.notes=[{id:1,startTime:0,length:120,midiNum:67,tab:[3,0],optimals:[]}];
    const txt=buildGteExportFile(uke,"txt").content as string;
    expect(txt.split('\n').filter(l=>/^[AECG]\|/.test(l)).map(l=>l[0])).toEqual(["A","E","C","G"]);
    const xml=buildMusicXmlFromSnapshot(uke);
    expect(xml).toContain('<part-name>Ukulele</part-name>');
    expect(xml).toContain('<staff-lines>4</staff-lines>');
    expect(xml).toContain('<staff-tuning line="1"><tuning-step>G</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>');
    expect(JSON.parse(buildGteExportFile(uke,"json").content as string).editor.tuning).toEqual(uke.tuning);
  });
});
