import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { expect, it, vi } from "vitest";

it("opens a custom radio menu and applies a mode without a native select", () => {
  const states: any[] = []; let index = 0;
  const module = { exports: {} as any };
  const source = ts.transpileModule(readFileSync("components/GteScaleModeMenu.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, window: { innerHeight: 800 }, document: { body: {} },
    require: (name: string) => name === "react/jsx-runtime" ? jsx : name === "react-dom" ? { createPortal: (node: any) => node } : {
      useState: (initial: any) => { const at = index++; if (!(at in states)) states[at] = initial; return [states[at], (value: any) => { states[at] = value; }]; },
      useRef: (current: any) => { const at = index++; if (!(at in states)) states[at] = { current }; return states[at]; }, useEffect: () => {},
    },
  });
  const onChange = vi.fn(), focus = vi.fn();
  const props = { value: "length", onChange, disabled: false, label: "Scale mode", options: [{ value: "length", label: "Length" }, { value: "start", label: "Start time" }, { value: "both", label: "Start + length" }] };
  const walk = (node: any): any[] => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  const render = () => { index = 0; return walk(module.exports.default(props)); };
  const trigger = render().find((node) => node.type === "button");
  trigger.ref.current = { getBoundingClientRect: () => ({ left: 1000, top: 400 }), focus };
  trigger.props.onClick();
  const opened = render();
  expect(opened.some((node) => node.type === "select")).toBe(false);
  expect(opened.find((node) => node.props.role === "menu").props.style.left).toBe(832);
  const choices = opened.filter((node) => node.props.role === "menuitemradio");
  expect(choices).toHaveLength(3);
  expect(choices[0].props["aria-checked"]).toBe(true);
  choices[2].props.onClick();
  expect(onChange).toHaveBeenCalledWith("both");
  expect(focus).toHaveBeenCalled();
  expect(render().some((node) => node.props.role === "menu")).toBe(false);
});
