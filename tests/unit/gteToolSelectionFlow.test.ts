import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { toolAllowsSelection } from "../../lib/gteToolSelection";

const source = readFileSync("components/GteWorkspace.tsx", "utf8");
const ast = ts.createSourceFile("workspace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function action(name: string, context: Record<string, any>) {
  let code = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) code = node.initializer!.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return vm.runInNewContext(ts.transpileModule(`(${code})`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
}
describe("select-after-tool flow", () => {
  it("returns the picked objects to Optimize fingerings without applying it", () => {
    const snapshot = { notes: [{ id: 1 }], chords: [{ id: 2 }] };
    let dialog: any = { snapshot: {}, selection: { noteIds: [], chordIds: [] } };
    const selecting = vi.fn(), pending = vi.fn();
    action("applyPendingSelectionTool", {
      pendingSelectionTool: "optimize", canApplyPendingSelectionTool: true, setPendingSelectionTool: pending,
      setOptimizeDialog: (fn: Function) => { dialog = fn(dialog); }, setOptimizationSelecting: selecting,
      snapshotRef: { current: snapshot }, cloneSnapshot: structuredClone, selectedNoteIds: [1], activeChordIds: [2], resolveNoteId: (id: number) => id, resolveChordId: (id: number) => id,
    })();
    expect(dialog.selection).toEqual({ noteIds: [1], chordIds: [2] });
    expect(dialog.snapshot).toEqual(snapshot);
    expect(pending).toHaveBeenCalledWith(null);
    expect(selecting).toHaveBeenCalledWith(false);
    selecting.mockClear();
    action("cancelToolSelection", { pendingSelectionTool: "optimize", setPendingSelectionTool: pending, setOptimizationSelecting: selecting })();
    expect(selecting).toHaveBeenCalledWith(false);
  });
  it("toggles selected objects without moving them and ignores ineligible objects", () => {
    let notes: number[] = [], chords: number[] = [];
    class Target {
      dataset: Record<string, string>;
      constructor(kind: string, id: number) { this.dataset = { [kind === "note" ? "toolSelectNote" : "toolSelectChord"]: String(id) }; }
      closest(selector: string) { return selector.includes("select-note") && this.dataset.toolSelectNote || selector.includes("select-chord") && this.dataset.toolSelectChord ? this : null; }
    }
    const context = { pendingSelectionTool: "merge-chord", Element: Target, HTMLElement: Target, document: { activeElement: null }, toolAllowsSelection,
      setSelectedNoteIds: (fn: Function) => { notes = fn(notes); }, setSelectedChordIds: (fn: Function) => { chords = fn(chords); } };
    const toggle = action("togglePendingToolObject", context);
    toggle(new Target("note", 1)); toggle(new Target("chord", 2));
    expect(notes).toEqual([1]); expect(chords).toEqual([2]);
    toggle(new Target("note", 1)); toggle(new Target("chord", 2));
    expect(notes).toEqual([]); expect(chords).toEqual([]);
    context.pendingSelectionTool = "disband";
    toggle(new Target("note", 1)); toggle(new Target("chord", 2));
    expect(notes).toEqual([]); expect(chords).toEqual([2]);
    context.pendingSelectionTool = "bend";
    toggle(new Target("chord", 3));
    expect(chords).toEqual([2]);
  });
  it.each([true, false])("Enter respects tool validation (%s) and Escape cancels", (valid) => {
    const apply = vi.fn(), cancel = vi.fn();
    const context = { pendingSelectionTool: "merge-chord", isShortcutTextEntryTarget: () => false,
      applyPendingSelectionTool: () => { if (valid) apply(); }, cancelToolSelection: () => cancel(null), setPendingSelectionTool: cancel };
    const key = action("handleKeyDown", context);
    const event = (key: string) => ({ key, target: { closest: () => null }, preventDefault: vi.fn(), stopPropagation: vi.fn() });
    key(event("Enter"));
    expect(apply).toHaveBeenCalledTimes(valid ? 1 : 0);
    key(event("Escape"));
    expect(cancel).toHaveBeenCalledWith(null);
    // Number typing must not create notes while choosing a selection.
    expect(() => key(event("3"))).not.toThrow();
  });
});
