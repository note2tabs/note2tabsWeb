import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import { describe, expect, it, vi } from "vitest";
import * as optimization from "../../lib/gteOptimization";
import * as tuning from "../../lib/gteTuning";
import { insertCutBoundaryLocal, shiftCutBoundaryLocal } from "../../lib/gteLocalEditorOps";
import type { EditorSnapshot } from "../../types/gte";

function harness() {
  const states: any[] = []; let cursor = 0;
  const hooks = {
    useState: (initial: any) => {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (value: any) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useRef: (initial: any) => { const index = cursor++; if (!(index in states)) states[index] = { current: initial }; return states[index]; },
    useMemo: (fn: () => unknown) => fn(), useEffect: () => {},
  };
  const module = { exports: {} as any };
  const source = readFileSync("components/GteOptimizeDialog.tsx", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, structuredClone, require: (name: string) => {
    if (name === "react") return hooks;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name.includes("gteOptimization")) return optimization;
    if (name.includes("gteTuning")) return tuning;
    if (name.includes("i18n/react")) return { useLocale: () => ({ t: (key: string) => key }) };
    throw new Error(`Unexpected module ${name}`);
  } });
  const snapshot: EditorSnapshot = { id: "dialog", fps: 240, framesPerMessure: 480, totalFrames: 480, cutPositionsWithCoords: [[[0, 480], [2, 3]]], optimalsByTime: {},
    notes: [{ id: 1, startTime: 100, length: 120, tab: [1, 1], midiNum: 60, optimals: [] }], chords: [] };
  const props = { snapshot, selection: { noteIds: [1], chordIds: [] }, onApply: vi.fn(), onCancel: vi.fn(),
    renderCoordinateEditor: vi.fn((_draft: EditorSnapshot, _onChange: (next: EditorSnapshot) => void, _cutting: boolean, _end: number) => jsxRuntime.jsx("div", { "data-test-coordinate-editor": true })),
  };
  const render = () => { cursor = 0; return module.exports.default(props); };
  const walk = (node: any): any[] => {
    if (Array.isArray(node)) return node.flatMap(walk);
    if (!node || typeof node !== "object" || !node.props || node.props.inert) return [];
    return [node, ...walk(node.props.children)];
  };
  const text = (node: any): string => Array.isArray(node) ? node.map(text).join("") : typeof node === "string" || typeof node === "number" ? String(node) : node?.props ? text(node.props.children) : "";
  const nodes = () => walk(render());
  const button = (label: string) => nodes().find((node) => node.type === "button" && text(node) === label);
  return { props, nodes, button, render };
}

describe("Optimize dialog", () => {
  it("keeps positioning and scope independent", () => {
    const h = harness();
    expect(h.button("Automatic").props["aria-pressed"]).toBe(true);
    expect(h.button("Selected notes/chords").props["aria-pressed"]).toBe(true);
    h.button("Chosen fret position").props.onClick();
    expect(h.button("Selected notes/chords").props["aria-pressed"]).toBe(true);
    h.button("Whole track").props.onClick();
    expect(h.button("Chosen fret position").props["aria-pressed"]).toBe(true);
    h.button("Optimize").props.onClick();
    expect(h.props.onApply).toHaveBeenCalledWith(expect.objectContaining({ scope: "track", position: "chosen", fret: 5, custom: false }));
  });
  it("isolates nested edits until Done and discards them on Cancel", () => {
    const h = harness();
    h.button("Chosen fret position").props.onClick();
    expect(h.button("Edit").props.disabled).toBe(true);
    h.nodes().find((node) => node.type === "input" && node.props.type === "checkbox").props.onChange({ target: { checked: true } });
    h.button("Edit").props.onClick();
    h.nodes();
    let [draft, onChange] = h.props.renderCoordinateEditor.mock.lastCall!;
    expect(draft.totalFrames).toBe(120);
    expect(draft.notes[0].startTime).toBe(0);
    onChange({ ...draft, cutPositionsWithCoords: [[[0, 120], [2, 9]]] });
    h.button("Cancel").props.onClick();
    expect(h.props.onApply).not.toHaveBeenCalled();
    h.button("Edit").props.onClick();
    h.nodes();
    [draft, onChange] = h.props.renderCoordinateEditor.mock.lastCall!;
    expect(draft.cutPositionsWithCoords).toEqual([[[0, 120], [2, 3]]]);
    onChange({ ...draft, cutPositionsWithCoords: [[[0, 60], [2, 9]], [[60, 120], [1, 7]]] });
    h.button("Done").props.onClick();
    h.button("Optimize").props.onClick();
    expect(h.props.onApply).toHaveBeenCalledWith(expect.objectContaining({ custom: true, cuts: [[[100, 160], [2, 9]], [[160, 220], [1, 7]]] }));
    expect(h.props.snapshot.cutPositionsWithCoords).toEqual([[[0, 480], [2, 3]]]);
  });
  it("uses the existing cut operations on the cropped draft and resets custom regions on scope changes", () => {
    const h = harness(); h.button("Chosen fret position").props.onClick();
    h.nodes().find((node) => node.props.type === "checkbox").props.onChange({ target: { checked: true } });
    h.button("Edit").props.onClick(); h.button("Cut").props.onClick(); h.nodes();
    const [draft, onChange, cutting, end] = h.props.renderCoordinateEditor.mock.lastCall!;
    expect(cutting).toBe(true); expect(end).toBe(120);
    onChange(shiftCutBoundaryLocal(insertCutBoundaryLocal(draft, 60, [1, 5]), 1, 70));
    h.button("Done").props.onClick(); h.button("Optimize").props.onClick();
    expect(h.props.onApply.mock.calls[0][0].cuts[0][0][1]).toBe(170);
    h.button("Whole track").props.onClick();
    expect(h.button("Edit").props.disabled).toBe(true);
    expect(h.button("Chosen fret position").props["aria-pressed"]).toBe(true);
  });
});
