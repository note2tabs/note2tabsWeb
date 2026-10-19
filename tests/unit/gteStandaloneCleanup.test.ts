import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { cleanTinyOverlapsInSnapshot } from "../../lib/gteOverlapCleanup";
import type { EditorSnapshot } from "../../types/gte";

const source = readFileSync("pages/gte/[editor_id].tsx", "utf8");
const ast = ts.createSourceFile("editor.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let action = "";
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "handleCleanActiveTrack") action = node.initializer!.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
function harness() {
  const lane: EditorSnapshot = { id: "active", trackType: "tab", fps: 240, framesPerMessure: 480,
    timeSignature: 4, totalFrames: 480, chords: [], cutPositionsWithCoords: [], optimalsByTime: {},
    notes: [{ id: 1, startTime: 0, length: 122, midiNum: 60, tab: [0, 3], optimals: [] },
      { id: 2, startTime: 120, length: 120, midiNum: 62, tab: [0, 5], optimals: [] }] };
  const other = { ...structuredClone(lane), id: "other" };
  const state = { canvasRef: { current: { editors: [other, lane] } }, activeLaneId: "active",
    practiceModeEnabled: false, structuredClone, cleanTinyOverlapsInSnapshot,
    isDrumLane: (value: EditorSnapshot) => value.trackType === "drums",
    setTrackCleanupResult: vi.fn(), handleLaneSnapshotChange: vi.fn(), queueDrumSave: vi.fn() };
  return { lane, other, state, clean: vm.runInNewContext(ts.transpileModule(`(${action})`, {}).outputText, state) };
}
describe("standalone Tools overlap cleanup", () => {
  it("uses the wider manual margin rather than the conservative import margin", () => {
    const { lane, state, clean } = harness(); lane.notes[0].length = 144;
    clean();
    expect(state.setTrackCleanupResult).toHaveBeenCalledWith({ laneId: "active", count: 1 });
    expect(state.handleLaneSnapshotChange.mock.calls[0][1].notes[0].length).toBe(120);
  });
  it("cleans only the active track, updates history through the normal lane callback and queues persistence", () => {
    const { lane, other, state, clean } = harness(); clean();
    expect(state.setTrackCleanupResult).toHaveBeenCalledWith({ laneId: "active", count: 1 });
    const [id, next] = state.handleLaneSnapshotChange.mock.calls[0];
    expect(id).toBe("active"); expect(next.notes[0].length).toBe(120);
    expect(next.notes[1].startTime).toBe(120);
    expect(lane.notes[0].length).toBe(122); expect(other.notes[0].length).toBe(122);
    expect(state.queueDrumSave).toHaveBeenCalledExactlyOnceWith("active", next);
  });
  it("does not save or record history when no cleanup is needed", () => {
    const { lane, state, clean } = harness(); lane.notes[0].length = 120; clean();
    expect(state.setTrackCleanupResult).toHaveBeenCalledWith({ laneId: "active", count: 0 });
    expect(state.handleLaneSnapshotChange).not.toHaveBeenCalled(); expect(state.queueDrumSave).not.toHaveBeenCalled();
  });
  it("guards missing tracks, drums and practice mode", () => {
    for (const mode of ["missing", "drums", "practice"]) {
      const { lane, state, clean } = harness();
      if (mode === "missing") state.activeLaneId = "missing";
      if (mode === "drums") lane.trackType = "drums";
      if (mode === "practice") state.practiceModeEnabled = true;
      clean(); expect(state.handleLaneSnapshotChange).not.toHaveBeenCalled(); expect(state.queueDrumSave).not.toHaveBeenCalled();
    }
  });
  it("exposes the standalone item in all three Tools layouts", () => {
    expect(source.match(/\{renderTrackCleanupTool\(\)\}/g)).toHaveLength(3);
  });
  it("shows cleanup feedback in the shared bottom-right message position, not inside Tools", () => {
    expect(source).toMatch(/data-gte-cleanup-feedback="true"\s+className="fixed bottom-4 right-4/);
    const start = source.indexOf("const renderTrackCleanupTool =");
    const end = source.indexOf("const handleLaneInstrumentChange", start);
    expect(source.slice(start, end)).not.toContain('role="status"');
    expect(source).toContain("window.setTimeout(() => setTrackCleanupResult(null), 5000)");
  });
});
