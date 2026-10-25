import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import VexFlow from "vexflow/bravura";
import * as jsx from "react/jsx-runtime";
import { expect, it, vi } from "vitest";

it("highlights every selected voice, falling back to the insertion voice without selection", () => {
  const module = { exports: {} as any };
  const source = ts.transpileModule(readFileSync("components/GteNotationToolbar.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: (name: string) => {
    if (name === "react/jsx-runtime") return jsx;
    if (name === "vexflow/bravura") return { default: VexFlow };
    return { useLocale: () => ({ t: (value: string) => value }) };
  } });
  const elements = (node: any): any[] => Array.isArray(node) ? node.flatMap(elements) : node?.props ? [node, ...elements(node.props.children)] : [];
  const onVoice = vi.fn();
  const render = (selectedVoices?: number[]) => elements(module.exports.default({ voice: 1, selectedVoices, onVoice, disabled: false, onDuration: () => {} }))
    .filter(node => node.type === "button" && /^Voice [12]$/.test(node.props["aria-label"]));
  expect(render([1, 2]).map(node => node.props["aria-pressed"])).toEqual([true, true]);
  expect(render([2]).map(node => node.props["aria-pressed"])).toEqual([false, true]);
  expect(render([1]).map(node => node.props["aria-pressed"])).toEqual([true, false]);
  expect(render().map(node => node.props["aria-pressed"])).toEqual([true, false]);
  render([1, 2])[1].props.onClick();
  expect(onVoice).toHaveBeenCalledWith(2);
});
