import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { expect, it, vi } from "vitest";

it("song settings closes on outside clicks, not mouse leave, blur, or Escape", () => {
  const setOpen = vi.fn(), schedule = vi.fn(), listeners = new Map<string, Function>();
  const module = { exports: {} as any };
  const compiled = ts.transpileModule(readFileSync("components/HoverSettingsDropdown.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  class FakeNode {}
  vm.runInNewContext(compiled, { module, exports: module.exports, Node: FakeNode, setTimeout: schedule, clearTimeout: vi.fn(),
    document: { addEventListener: (type: string, fn: Function) => listeners.set(type, fn), removeEventListener: vi.fn() },
    require: (name: string) => name === "react/jsx-runtime" ? jsx : {
      useState: () => [true, setOpen], useRef: (current: unknown) => ({ current }), useEffect: (fn: Function) => fn(),
    },
  });
  const root = module.exports.default({ summary: "Song settings", panelTitle: "Song settings", clickDismissOnly: true });
  root.props.onPointerLeave({ pointerType: "mouse" });
  root.props.onBlur({});
  listeners.get("keydown")!({ key: "Escape" });
  expect(listeners.has("pointermove")).toBe(false);
  expect(setOpen).not.toHaveBeenCalled();
  expect(schedule).not.toHaveBeenCalled();
  listeners.get("pointerdown")!({ target: new FakeNode() });
  expect(setOpen).toHaveBeenCalledWith(false);
  const walk = (node: any): any[] => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  expect(walk(root).filter((node) => node.type === "button")).toHaveLength(0);
});
