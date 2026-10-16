import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("components/GteWorkspace.tsx", "utf8");
const ast = ts.createSourceFile("GteWorkspace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let mouseUp = "";
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "handleUp" && node.initializer?.getText(ast).includes("onGlobalPlaybackFrameChange?.(startTime)")) mouseUp = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);

describe("mouse cursor and playback anchor alignment", () => {
  it.each([
    [179, 40, 120, 1, 120],
    [179, 40, 120, 15, 120],
    [119, 40, 120, 1, 0],
    [120, 40, 120, 1, 120],
    [1919, 40, 120, 1, 1800],
    [179, 220, 120, 1, 2040],
    [179, 40, 60, 1, 120],
    [179, 40, 15, 1, 165],
  ])("click x=%s y=%s uses cursor step %s (snap %s) and seeks to %s", (x, y, step, snap, expected) => {
    expect(mouseUp).not.toBe("");
    const context: Record<string, any> = {
      selectionRef: { current: { startX: x, endX: x, startY: y, endY: y, additive: false } },
      clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
      rowStride: 180, rows: 5, rowHeight: 120, rowFrames: 1920, framesPerMeasure: 480, stringMax: 5, ROW_HEIGHT: 20, scale: 1,
      getRowBarCount: () => 4, snapStartTimeToGrid: (frame: number) => Math.floor(frame / snap) * snap,
      cursorSizeDenominator: 4, cursorSizeDenominatorToFrames: () => step,
      keyboardGridCursorRef: { current: null }, mobileViewport: false, document: { activeElement: null }, HTMLElement: class {},
      setKeyboardGridCursor: vi.fn(), setKeyboardCursorVisible: vi.fn(), setKeyboardAddMode: vi.fn(), setDraftNote: vi.fn(), setDraftNoteAnchor: vi.fn(), setSelection: vi.fn(), onGlobalPlaybackFrameChange: vi.fn(),
    };
    vm.runInNewContext(ts.transpileModule(`(${mouseUp})()`, {}).outputText, context);
    expect(context.setKeyboardGridCursor).toHaveBeenCalledWith({ time: expected, stringIndex: 2 });
    expect(context.onGlobalPlaybackFrameChange).toHaveBeenCalledExactlyOnceWith(expected);
  });
});

describe("cursor-context editing settings", () => {
  let activeExpression = "";
  let visibilityEffect = "";
  function find(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "editingCursorActive") activeExpression = node.initializer!.getText(ast);
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.arguments[0]?.getText(ast).includes("cursorActiveCallbackRef.current?.(editingCursorActive)")) visibilityEffect = node.arguments[0].getText(ast);
    ts.forEachChild(node, find);
  }
  find(ast);
  it("requires a visible cursor on the active desktop canvas", () => {
    const state = { keyboardCursorMarker: {}, isActive: true, mobileViewport: false, tabViewEnabled: false, practiceMode: false };
    const evaluate = (context: Record<string, unknown>) => vm.runInNewContext(ts.transpileModule(`(${activeExpression})`, {}).outputText, context);
    expect(evaluate(state)).toBe(true);
    for (const patch of [{ keyboardCursorMarker: null }, { isActive: false }, { mobileViewport: true }, { tabViewEnabled: true }, { practiceMode: true }]) expect(evaluate({ ...state, ...patch })).toBe(false);
  });
  it("reports cursor activation and clears the panel on cleanup", () => {
    const callback = vi.fn();
    const cleanup = vm.runInNewContext(ts.transpileModule(`(${visibilityEffect})()`, {}).outputText, { cursorActiveCallbackRef: { current: callback }, editingCursorActive: true });
    expect(callback).toHaveBeenLastCalledWith(true);
    cleanup();
    expect(callback).toHaveBeenLastCalledWith(false);
  });
});
