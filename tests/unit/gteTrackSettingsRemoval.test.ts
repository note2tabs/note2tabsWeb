import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("pages/gte/[editor_id].tsx", "utf8");
const ast = ts.createSourceFile("editor.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let action = "";
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "handleDeleteLane") action = node.initializer!.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
function harness(count = 2) {
  const canvas = { editors: [{ id: "a" }, { id: "b" }].slice(0, count), version: 1 };
  const state: Record<string, any> = {
    canvas, canvasRef: { current: canvas }, deletingLaneId: null, activeLaneId: "a", mobileEditLaneId: null, editorId: "test", isGuestMode: true,
    normalizeCanvas: (value: unknown) => value, toNumber: (value: unknown, fallback: number) => Number(value) || fallback,
    setConfirmDeleteTrackId: vi.fn(), setDeletingLaneId: vi.fn(), setError: vi.fn(), applyCanvasUpdate: vi.fn(), setActiveLaneId: vi.fn(), setMobileEditLaneId: vi.fn(),
    setDesktopTrackSettingsCollapsed: vi.fn(), setDesktopTrackMenuOpen: vi.fn(), setDesktopTrackAddMenuOpen: vi.fn(),
    gteApi: { applySnapshot: vi.fn().mockResolvedValue({}) },
  };
  return { state, remove: vm.runInNewContext(ts.transpileModule(`(${action})`, {}).outputText, state) };
}

describe("track settings after removal", () => {
  it("closes the settings before switching to the next active track", async () => {
    const { state, remove } = harness();
    await remove("a");
    expect(state.setDesktopTrackSettingsCollapsed).toHaveBeenCalledWith(true);
    expect(state.setDesktopTrackMenuOpen).toHaveBeenCalledWith(false);
    expect(state.setDesktopTrackAddMenuOpen).toHaveBeenCalledWith(false);
    expect(state.setActiveLaneId).toHaveBeenCalledWith("b");
    expect(state.setDesktopTrackSettingsCollapsed.mock.invocationCallOrder[0]).toBeLessThan(state.applyCanvasUpdate.mock.invocationCallOrder[0]);
  });
  it("leaves the settings alone when removal is rejected for the final track", async () => {
    const { state, remove } = harness(1);
    await remove("a");
    expect(state.setDesktopTrackSettingsCollapsed).not.toHaveBeenCalled();
    expect(state.gteApi.applySnapshot).not.toHaveBeenCalled();
    expect(state.setError).toHaveBeenCalled();
  });
  it("does not close another panel for a missing track", async () => {
    const { state, remove } = harness();
    await remove("missing");
    expect(state.setDesktopTrackSettingsCollapsed).not.toHaveBeenCalled();
    expect(state.gteApi.applySnapshot).not.toHaveBeenCalled();
  });
  it("retains failure recovery without reopening settings on the replacement track", async () => {
    const { state, remove } = harness();
    state.gteApi.applySnapshot.mockRejectedValue(new Error("Failed to remove"));
    await remove("a");
    expect(state.canvasRef.current.editors.map((lane: { id: string }) => lane.id)).toEqual(["a", "b"]);
    expect(state.setDesktopTrackSettingsCollapsed).toHaveBeenCalledExactlyOnceWith(true);
    expect(state.setError).toHaveBeenLastCalledWith("Failed to remove");
  });
});
