import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/GteWorkspace.tsx", "utf8");
const ast = ts.createSourceFile("workspace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let compute = "";
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "computeQuantizePreview" && node.initializer && ts.isCallExpression(node.initializer)) compute = node.initializer.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);

describe("snap to beat", () => {
  it("slightly favors longer lengths while preserving exact grid durations", () => {
    const preview = vm.runInNewContext(ts.transpileModule(`(${compute})(session, 8, 1, true)`, {}).outputText, {
      session: { minTime: 0, notes: [
        { id: 1, startTime: 0, length: 43 },
        { id: 2, startTime: 0, length: 40 },
        { id: 3, startTime: 0, length: 60 },
      ], chords: [] },
      clamp: (n: number, min: number, max: number) => Math.max(min, Math.min(max, n)),
      QUANTIZE_SUBDIVISION_MIN: 1, QUANTIZE_SUBDIVISION_MAX: 64,
      SCALE_FACTOR_MIN: 0.01, SCALE_FACTOR_MAX: 100,
      framesPerMeasure: 480, timeSignature: 4, timeSignatureBottom: 4,
    });
    expect(preview.notes[1].length).toBe(60);
    expect(preview.notes[2].length).toBe(30);
    expect(preview.notes[3].length).toBe(60);
  });
  it.each([[4, 4, 480, 60], [6, 8, 720, 120]])("uses eighth-note lengths in %s/%s", (top, bottom, frames, eighth) => {
    const preview = vm.runInNewContext(ts.transpileModule(`(${compute})(session, 8, 1, true)`, {}).outputText, {
      session: { minTime: 0, notes: [{ id: 1, startTime: eighth + 5, length: eighth - 5 }], chords: [] },
      clamp: (n: number, min: number, max: number) => Math.max(min, Math.min(max, n)),
      QUANTIZE_SUBDIVISION_MIN: 1, QUANTIZE_SUBDIVISION_MAX: 64,
      SCALE_FACTOR_MIN: 0.01, SCALE_FACTOR_MAX: 100,
      framesPerMeasure: frames, timeSignature: top, timeSignatureBottom: bottom,
    });
    expect(preview.notes[1]).toEqual({ startTime: eighth, length: eighth });
  });
  it("defaults to 1/8 and removes the pre-scaling field", () => {
    expect(source).toContain("const [quantizeSubdivision, setQuantizeSubdivision] = useState(8)");
    expect(source).toContain('const [quantizeSubdivisionInput, setQuantizeSubdivisionInput] = useState("8")');
    expect(source).not.toContain('t("Pre scaling")');
    expect(source).toContain("const quantizePreScale = 1;");
  });
  it.each([true, false])("uses half-grid lengths only when length snapping is enabled (%s)", (snapLength) => {
    const preview = vm.runInNewContext(ts.transpileModule(`(${compute})(session, 8, 1, snapLength)`, {}).outputText, {
      session: { minTime: 0, notes: [{ id: 1, startTime: 65, length: 32 }], chords: [{ id: 2, startTime: 125, length: 88 }] },
      snapLength,
      clamp: (n: number, min: number, max: number) => Math.max(min, Math.min(max, n)),
      QUANTIZE_SUBDIVISION_MIN: 1, QUANTIZE_SUBDIVISION_MAX: 64,
      SCALE_FACTOR_MIN: 0.01, SCALE_FACTOR_MAX: 100,
      framesPerMeasure: 480, timeSignature: 4, timeSignatureBottom: 4,
    });
    expect(preview.notes[1]).toEqual({ startTime: 60, length: snapLength ? 30 : 32 });
    expect(preview.chords[2]).toEqual({ startTime: 120, length: snapLength ? 120 : 88 });
  });
  it("snaps note and chord lengths to binary values rather than dotted or arbitrary grid multiples", () => {
    const lengths = [30, 60, 90, 120, 180, 240, 300, 360, 480, 720, 960];
    const preview = vm.runInNewContext(ts.transpileModule(`(${compute})(session, 8, 1, true)`, {}).outputText, {
      session: { minTime: 0, notes: lengths.map((length, id) => ({ id, startTime: 65, length })),
        chords: lengths.map((length, id) => ({ id, startTime: 125, length })) },
      clamp: (n: number, min: number, max: number) => Math.max(min, Math.min(max, n)),
      QUANTIZE_SUBDIVISION_MIN: 1, QUANTIZE_SUBDIVISION_MAX: 64,
      SCALE_FACTOR_MIN: 0.01, SCALE_FACTOR_MAX: 100,
      framesPerMeasure: 480, timeSignature: 4, timeSignatureBottom: 4,
    });
    const expected = [30, 60, 120, 120, 240, 240, 240, 480, 480, 960, 960];
    lengths.forEach((_, id) => {
      expect(preview.notes[id]).toEqual({ startTime: 60, length: expected[id] });
      expect(preview.chords[id]).toEqual({ startTime: 120, length: expected[id] });
    });
  });
});
