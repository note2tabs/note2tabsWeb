import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("components/GteWorkspace.tsx", "utf8");
const ast = ts.createSourceFile("workspace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect = "";
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" &&
    node.arguments[0]?.getText(ast).includes("const pauseEdgeMovement")) effect = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);

function harness() {
  const listeners: Record<string, (event?: unknown) => void> = {};
  let tick: (time: number) => void = () => {};
  const preview = vi.fn();
  const offset = { current: 0 };
  const cancel = vi.fn();
  const context = {
    moveToolActive: true, mobileViewport: false, scale: 2,
    mousePosRef: { current: { x: 100, y: 200 } },
    moveSessionRef: { current: { anchorX: 100, anchorPointerFrame: 50 } },
    moveEdgeOffsetRef: offset,
    getMovePointerFrame: (x: number) => x / 2, applyMovePreview: preview,
    window: { innerWidth: 1000,
      addEventListener: (name: string, callback: (event?: unknown) => void) => { listeners[name] = callback; },
      removeEventListener: vi.fn(), requestAnimationFrame: (callback: (time: number) => void) => { tick = callback; return 1; },
      cancelAnimationFrame: cancel },
    document: { hidden: false, hasFocus: () => true, addEventListener: vi.fn(), removeEventListener: vi.fn() },
  };
  const cleanup = vm.runInNewContext(ts.transpileModule(`(${effect})()`, {}).outputText, context);
  return { listeners, preview, offset, cancel, cleanup, tick: (time: number) => tick(time) };
}

describe("move tool edge dragging", () => {
  it("continues at the edge and keeps the accumulated movement when returning inward", () => {
    const h = harness();
    h.listeners.mousemove({ clientX: 1000, clientY: 200 });
    h.tick(0); h.tick(50);
    expect(h.preview).toHaveBeenLastCalledWith(456);
    h.listeners.mousemove({ clientX: 500, clientY: 200 });
    h.tick(100);
    expect(h.preview).toHaveBeenLastCalledWith(206);
    expect(h.offset.current).toBe(6);
  });
  it("moves left, pauses on blur, and cancels animation on cleanup", () => {
    const h = harness();
    h.listeners.mousemove({ clientX: 0, clientY: 200 });
    h.tick(0); h.tick(50);
    expect(h.preview).toHaveBeenLastCalledWith(-56);
    h.listeners.blur(); h.tick(100); h.tick(150);
    expect(h.offset.current).toBe(-6);
    h.cleanup();
    expect(h.cancel).toHaveBeenCalledWith(1);
  });
});
