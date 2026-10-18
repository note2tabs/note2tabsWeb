import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function expressions(path: string) {
  const ast = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const values = new Map<string, string>();
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.initializer) values.set(node.name.getText(ast), node.initializer.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return values;
}
const evaluate = (code: string, context: Record<string, any> = {}) => vm.runInNewContext(ts.transpileModule(`(${code})`, {}).outputText, context);

describe("eighth-note editor input defaults", () => {
  const backend = expressions("lib/gteEditorInputSettingsStore.ts");
  const backendContext = {
    NOTE_SIZE_DENOMINATORS: evaluate(backend.get("NOTE_SIZE_DENOMINATORS")!),
    CURSOR_SIZE_DENOMINATORS: evaluate(backend.get("CURSOR_SIZE_DENOMINATORS")!),
    isRecord: evaluate(backend.get("isRecord")!),
    normalizeDenominator: evaluate(backend.get("normalizeDenominator")!),
  };
  const frontend = expressions("pages/gte/[editor_id].tsx");
  const normalizeFrontend = evaluate(frontend.get("normalizeEditorInputSettings")!, {
    NOTE_LENGTH_FRACTION_DENOMINATORS: [0.5, 1, 2, 3, 4, 8, 16, 32, 64],
    CURSOR_SIZE_FRACTION_DENOMINATORS: [1, 2, 4, 8, 16, 32],
  });
  const normalizeBackend = evaluate(backend.get("normalizeGteEditorInputSettings")!, backendContext);
  it.each([undefined, {}, { defaultNoteLengthDenominator: -1, cursorSizeDenominator: "invalid" }])("defaults missing/invalid sizes to 1/8: %j", (settings) => {
    for (const normalize of [normalizeFrontend, normalizeBackend]) expect(normalize(settings)).toEqual({ defaultNoteLengthDenominator: 8, cursorSizeDenominator: 8 });
  });
  it("preserves saved sizes instead of overriding existing preferences", () => {
    const saved = { defaultNoteLengthDenominator: 4, cursorSizeDenominator: 16 };
    expect(normalizeFrontend(saved)).toEqual(saved);
    expect(normalizeBackend(saved)).toEqual(saved);
  });
  it("starts the page and standalone workspace at 1/8 before settings load", () => {
    expect(frontend.get("[chordOnlyDefaultNoteLengthDenominator, setChordOnlyDefaultNoteLengthDenominator]")).toBe("useState(8)");
    expect(frontend.get("[chordOnlyCursorSizeDenominator, setChordOnlyCursorSizeDenominator]")).toBe("useState(8)");
    const workspace = expressions("components/GteWorkspace.tsx");
    expect(workspace.get("[localDefaultNoteLengthDenominator, setLocalDefaultNoteLengthDenominator]")).toBe("useState(8)");
    expect(workspace.get("[localCursorSizeDenominator, setLocalCursorSizeDenominator]")).toBe("useState(8)");
  });
});
