import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { expect, it, vi } from "vitest";

it("renders a label-free inline seek strip and updates the shared playback position", () => {
  const module = { exports: {} as any };
  const source = ts.transpileModule(readFileSync("components/GtePracticeScrubber.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: (name: string) => {
    if (name === "react") return { useRef: (current: unknown) => ({ current }), useEffect: () => {} };
    if (name === "react/jsx-runtime") return jsx;
    if (name.includes("i18n")) return { useLocale: () => ({ t: (value: string) => value }) };
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  const seek = vi.fn(), setProperty = vi.fn();
  const view = module.exports.default({ snapshot: { totalFrames: 480 }, onGlobalPlaybackFrameChange: seek });
  expect(view.type).toBe("div");
  expect(view.props.className).not.toContain("absolute");
  const input = view.props.children;
  expect(input.type).toBe("input");
  expect(input.props.type).toBe("range");
  expect(input.props["aria-label"]).toBe("Song position");
  input.props.onChange({ currentTarget: { value: "240", style: { setProperty } } });
  expect(seek).toHaveBeenCalledWith(240);
  expect(setProperty).toHaveBeenCalledWith("--seek-progress", "50%");
});
