import { describe, it, expect, vi } from "vitest";
import { createStreamingWorkspaceApi } from "../../lib/gteStreamingWorkspace";
import { recordStreamingCanvasEdit, emptyStreamingEdits, applyStreamingEdits } from "../../lib/gteStreamingEdits";
import { finalizeStreamingEdits } from "../../lib/gteStreamingImport";
import type { CanvasSnapshot } from "../../types/gte";
const fixture = (): CanvasSnapshot => ({ id: "stream-job", name: "Song", secondsPerBar: 2, editors: [{ id: "source", name: "Piano", program: 0, instrumentType: "notation", instrumentId: "upright_piano", fps: 240, totalFrames: 480, framesPerMessure: 480, notes: [{ id: -1, startTime: 0, length: 60, midiNum: 60, tab: [0, 0], optimals: [] }], chords: [], cutPositionsWithCoords: [], optimalsByTime: {} }] });
describe("real editor streaming boundary", () => {
  it("uses local persistence and refuses unsupported actions rather than falling through to real APIs", async () => {
    const fetch = vi.spyOn(globalThis, "fetch"); const canvas = fixture(), api = createStreamingWorkspaceApi(() => canvas);
    const next = structuredClone(canvas); next.editors[0].notes[0].midiNum = 65;
    expect((await api.applySnapshot(canvas.id, next)).canvas).toEqual(next);
    expect((await api.commitEditor(canvas.id)).snapshot).toEqual(canvas);
    await expect(api.mergeTracks(canvas.id, { expectedVersion: 1, laneIds: [] })).rejects.toThrow("when transcription finishes");
    expect(fetch).not.toHaveBeenCalled(); fetch.mockRestore();
  });
  it("preserves track settings, song title, track additions/removals and order across incoming source", async () => {
    const base = fixture(), api = createStreamingWorkspaceApi(() => base);
    const added = await api.addCanvasEditor(base.id, "My bass", { editorType: "bass" });
    const next = added.canvas; next.name = "My arrangement"; next.editors[0].instrumentId = "grand_piano";
    next.editors.reverse();
    const draft = recordStreamingCanvasEdit(emptyStreamingEdits(), base, next);
    const incoming = fixture(); incoming.editors[0].notes.push({ ...incoming.editors[0].notes[0], id: -2, startTime: 240 });
    const merged = applyStreamingEdits(incoming, draft);
    expect(merged.name).toBe("My arrangement"); expect(merged.editors[0].name).toBe("My bass");
    expect(merged.editors[1].instrumentId).toBe("grand_piano"); expect(merged.editors[1].notes).toHaveLength(2);
    const removed = { ...merged, editors: [merged.editors[0]] };
    const deleted = recordStreamingCanvasEdit(draft, merged, removed);
    expect(applyStreamingEdits(incoming, deleted).editors.map(lane => lane.name)).toEqual(["My bass"]);
    expect(finalizeStreamingEdits(incoming, deleted, ["source"], undefined, {}).editors.map(lane => lane.name)).toEqual(["My bass"]);
  });
  it("keeps title-only edits in the final saved import", () => {
    const base = fixture(), next = { ...base, name: "Named while transcribing" };
    const draft = recordStreamingCanvasEdit(emptyStreamingEdits(), base, next);
    expect(draft.tracks).toHaveLength(0);
    expect(finalizeStreamingEdits(base, draft, ["source"], undefined, {}).name).toBe(next.name);
  });
});
