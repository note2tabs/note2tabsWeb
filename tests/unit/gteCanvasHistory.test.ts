import React, { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useGteCanvasState } from "../../lib/useGteCanvasState";
import { sameHistoryContent } from "../../lib/gteHistoryEquality";
import { appendBoundedHistory } from "../../lib/gteEditorPerformance";
import { RevisionedAutosaveQueue } from "../../lib/gteAutosaveQueue";
import type { CanvasSnapshot } from "../../types/gte";
import { assignVoices } from "../../lib/gteAssignVoices";

const source = readFileSync("pages/gte/[editor_id].tsx", "utf8");
const ast = ts.createSourceFile("editor.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const actions = new Map<string, string>();
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.initializer) {
    const value = ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === "useCallback"
      ? node.initializer.arguments[0] : node.initializer;
    actions.set(node.name.getText(ast), value.getText(ast));
  }
  ts.forEachChild(node, visit);
}
visit(ast);
const callback = (name: string, scope: Record<string, unknown>) => vm.runInNewContext(
  ts.transpileModule(`(${actions.get(name)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, scope);
const canvas = (notes = 0): CanvasSnapshot => ({ id: "song", editors: [{ id: "track", fps: 240,
  framesPerMessure: 480, totalFrames: 480, chords: [], optimalsByTime: {}, cutPositionsWithCoords: [],
  notes: Array.from({ length: notes }, (_, i) => ({ id: i + 1, midiNum: 60, tab: [0, 0], startTime: i * 60, length: 60, optimals: [] })) }] });

let dom: JSDOM, root: Root | undefined;
beforeAll(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.replaceChildren(); });
afterAll(() => { dom.window.close(); vi.unstubAllGlobals(); });

async function harness() {
  const scope: Record<string, any> = { sameHistoryContent, appendBoundedHistory, MAX_CANVAS_HISTORY: 64,
    canvasUndoRef: { current: [] }, canvasRedoRef: { current: [] }, addingLane: false, deletingLaneId: null,
    savingCanvas: false, canvasRevisionRef: { current: 0 }, rebaseHistoryLaneSaves: vi.fn(), router: { query: {} },
    setCanvasUndoCount: vi.fn(), setCanvasRedoCount: vi.fn(),
    setHasPendingCommit: vi.fn(), syncCanvasDraftToBackend: vi.fn().mockResolvedValue(undefined) };
  scope.recordCanvasHistory = callback("recordCanvasHistory", scope);
  function Harness() {
    const [value, setCanvas, canvasRef] = useGteCanvasState();
    Object.assign(scope, { canvas: value, setCanvas, canvasRef });
    return React.createElement("span", null, value?.editors[0].notes.length ?? "loading");
  }
  const container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(React.createElement(StrictMode, null, React.createElement(Harness))));
  await act(async () => scope.setCanvas(canvas()));
  const edit = (next: CanvasSnapshot) => scope.setCanvas((previous: CanvasSnapshot) => {
    scope.recordCanvasHistory(previous, next); return next;
  });
  return { scope, edit, undo: callback("handleCanvasUndo", scope), redo: callback("handleCanvasRedo", scope), container };
}

describe("React editor undo/redo transactions", () => {
  it("undoes and redoes automatic voice assignment through the existing canvas history", async () => {
    const { scope, edit, undo, redo } = await harness();
    const before = canvas(2); before.editors[0].instrumentType = "notation";
    await act(async () => edit(before));
    const result = assignVoices({ track: before.editors[0] });
    await act(async () => edit({ ...before, editors: [result.track] }));
    expect(scope.canvasRef.current.editors[0].notes[0].notationVoice).toBe(1);
    await act(async () => undo());
    expect(scope.canvasRef.current.editors[0].notes[0].notationVoice).toBeUndefined();
    await act(async () => redo());
    expect(scope.canvasRef.current.editors[0].notes[0].notationVoiceSource).toBe("auto");
  });
  it("records each batched edit once in StrictMode and persists every rapid undo/redo", async () => {
    const { scope, edit, undo, redo, container } = await harness();
    await act(async () => { edit(canvas(1)); edit(canvas(2)); });
    expect(scope.canvasUndoRef.current.map((value: CanvasSnapshot) => value.editors[0].notes.length)).toEqual([0, 1]);
    await act(async () => {
      undo(); expect(scope.canvasRef.current.editors[0].notes).toHaveLength(1);
      undo(); expect(scope.canvasRef.current.editors[0].notes).toHaveLength(0);
    });
    expect(container.textContent).toBe("0");
    expect(scope.canvasRedoRef.current).toHaveLength(2);
    await act(async () => { redo(); redo(); });
    expect(container.textContent).toBe("2");
    expect(scope.canvasUndoRef.current).toHaveLength(2);
    expect(scope.syncCanvasDraftToBackend.mock.calls.map(([value]: [CanvasSnapshot]) => value.editors[0].notes.length)).toEqual([1, 0, 1, 2]);
  });
  it("does not spend history slots or clear redo for cloned content and save acknowledgements", async () => {
    const { scope, edit, undo, redo } = await harness();
    await act(async () => { edit(canvas(1)); edit(canvas(2)); });
    await act(async () => undo());
    await act(async () => {
      for (let i = 0; i < 100; i++) edit({ ...canvas(1), updatedAt: String(i), version: i });
    });
    expect(scope.canvasUndoRef.current).toHaveLength(1);
    expect(scope.canvasRedoRef.current).toHaveLength(1);
    await act(async () => redo());
    expect(scope.canvasRef.current.editors[0].notes).toHaveLength(2);
  });
  it("allows undo during a background commit and still invalidates redo after a real edit", async () => {
    const { scope, edit, undo } = await harness();
    await act(async () => edit(canvas(1)));
    scope.savingCanvas = true;
    await act(async () => undo());
    expect(scope.canvasRef.current.editors[0].notes).toHaveLength(0);
    await act(async () => edit(canvas(3)));
    expect(scope.canvasRedoRef.current).toHaveLength(0);
  });
  it("keeps meaningful changes to duration, pitch, tracks and timing distinct", () => {
    const original = canvas(1), changed = structuredClone(original);
    changed.editors[0].notes[0].length++;
    expect(sameHistoryContent(original, changed)).toBe(false);
    changed.editors[0].notes[0].length--;
    changed.editors[0].notes[0].midiNum++;
    expect(sameHistoryContent(original, changed)).toBe(false);
    expect(sameHistoryContent(original, { ...original, editors: [] })).toBe(false);
    expect(sameHistoryContent(original, { ...original, secondsPerBar: 3 })).toBe(false);
  });
  it("preserves pre-import history when reloading the same editor", async () => {
    const { scope, edit, undo } = await harness();
    await act(async () => edit(canvas(1)));
    Object.assign(scope, { isGuestMode: false, editorId: "song", gteApi: { getEditor: vi.fn().mockResolvedValue(canvas(2)) },
      normalizeCanvas: (value: CanvasSnapshot) => value, setLoading: vi.fn(), setError: vi.fn(),
      hydrateEditorInputSettings: vi.fn(), setActiveLaneId: vi.fn(), activeLaneHydratedRef: { current: true },
      resolveActiveLaneId: vi.fn(), setLastCommittedAt: vi.fn() });
    scope.resetCanvasHistory = callback("resetCanvasHistory", scope);
    await act(async () => callback("loadEditor", scope)());
    expect(scope.canvasUndoRef.current).toHaveLength(2);
    await act(async () => { undo(); undo(); });
    expect(scope.canvasRef.current.editors[0].notes).toHaveLength(0);
  });
  it("resets history when loading a genuinely different editor", async () => {
    const { scope, edit } = await harness();
    await act(async () => edit(canvas(1)));
    Object.assign(scope, { isGuestMode: false, editorId: "other", gteApi: { getEditor: vi.fn().mockResolvedValue({ ...canvas(2), id: "other" }) },
      normalizeCanvas: (value: CanvasSnapshot) => value, setLoading: vi.fn(), setError: vi.fn(),
      hydrateEditorInputSettings: vi.fn(), setActiveLaneId: vi.fn(), activeLaneHydratedRef: { current: true },
      resolveActiveLaneId: vi.fn(), setLastCommittedAt: vi.fn() });
    scope.resetCanvasHistory = callback("resetCanvasHistory", scope);
    await act(async () => callback("loadEditor", scope)());
    expect(scope.canvasUndoRef.current).toHaveLength(0);
    expect(scope.canvasRedoRef.current).toHaveLength(0);
  });
  it("replaces queued drum/track saves with restored snapshots and drops removed tracks", () => {
    const previous = canvas(2), restored = canvas(1);
    previous.editors[0].trackType = "drums"; restored.editors[0].trackType = "drums";
    const pendingDrumSavesRef = { current: new Map([["removed", previous.editors[0]]]) };
    const queueDrumSave = vi.fn();
    callback("rebaseHistoryLaneSaves", { pendingDrumSavesRef, queueDrumSave, Set,
      isDrumLane: (lane: any) => lane.trackType === "drums", sameHistoryContent })(previous, restored);
    expect(pendingDrumSavesRef.current.has("removed")).toBe(false);
    expect(queueDrumSave).toHaveBeenCalledExactlyOnceWith("track", restored.editors[0]);
  });
  it("follows an in-flight workspace edit with the externally restored undo state", async () => {
    const workspace = readFileSync("components/GteWorkspace.tsx", "utf8");
    const tree = ts.createSourceFile("workspace.tsx", workspace, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let effect = "";
    function find(node: ts.Node) {
      if (ts.isCallExpression(node) && node.expression.getText(tree) === "useEffect" && node.arguments[0]?.getText(tree).includes('"external-history"')) {
        effect = node.arguments[0].getText(tree);
      }
      ts.forEachChild(node, find);
    }
    find(tree);
    let release: (() => void) | undefined;
    const saved: number[] = [];
    const queue = new RevisionedAutosaveQueue({ debounceMs: 10000, save: async (value: any) => {
      saved.push(value.notes.length);
      if (saved.length === 1) await new Promise<void>((resolve) => { release = resolve; });
    } });
    const old = canvas(1).editors[0], restored = canvas(0).editors[0];
    queue.enqueue(old); const pending = queue.flushLatest();
    vm.runInNewContext(ts.transpileModule(`(${effect})`, {}).outputText, {
      useExternalHistory: true, sameHistoryContent, snapshotRef: { current: old }, snapshot: restored,
      editorId: "song::track", autosaveQueueRef: { current: queue },
    })();
    release!(); await pending; await queue.flushThroughLatest(); queue.dispose();
    expect(saved).toEqual([1, 0]);
  });
});
