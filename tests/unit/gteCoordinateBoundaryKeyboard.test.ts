import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("components/GteWorkspace.tsx", "utf8");
const handler = source.match(/const handleBoundaryDelete = \(event: KeyboardEvent\) => \{([\s\S]*?)\n    \};/)![1];
class Target {
  constructor(private inside: boolean, private editable: boolean) {}
  closest(selector: string) { return (selector === "[data-coordinate-editor]" ? this.inside : this.editable) ? this : null; }
}

describe("coordinate boundary Delete shortcut", () => {
  it("captures Delete before the dialog stops bubbling and focuses clicked boundaries", () => {
    expect(source).toContain('window.addEventListener("keydown", handleBoundaryDelete, true)');
    expect(source).toContain('window.removeEventListener("keydown", handleBoundaryDelete, true)');
    expect(source).toContain('if (coordinateEditorMode) event.currentTarget.focus({ preventScroll: true })');
  });
  it.each(["Delete", "Backspace"])("handles %s only inside the preview, outside editable fields", (key) => {
    const remove = vi.fn();
    const compiled = ts.transpileModule(`(event: KeyboardEvent) => {${handler}}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    const run = vm.runInNewContext(compiled, { HTMLElement: Target, handleMergeCutBoundary: remove });
    for (const [inside, editable, expected] of [[true, false, 1], [true, true, 0], [false, false, 0]] as const) {
      remove.mockClear();
      const event = { key, target: new Target(inside, editable), preventDefault: vi.fn(), stopPropagation: vi.fn() };
      run(event);
      expect(remove).toHaveBeenCalledTimes(expected);
      expect(event.preventDefault).toHaveBeenCalledTimes(expected);
    }
  });
});
