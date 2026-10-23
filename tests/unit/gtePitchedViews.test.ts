import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { expect, it } from "vitest";
import { isNotationTrack } from "../../lib/gteNotation";

it("routes pitched tracks to editable Sheets/MIDI while preserving Practice and guitar views", () => {
  const marker = (name: string) => Object.assign(() => null, { displayName: name });
  const module = { exports: {} as any };
  const source = ts.transpileModule(readFileSync("components/GteTrackWorkspace.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: (name: string) => {
    if (name === "react/jsx-runtime") return jsx;
    if (name === "next/dynamic") return { __esModule: true, default: (loader: () => unknown) => marker(loader.toString().includes("GteMidiWorkspace") ? "MIDI" : loader.toString().includes("GteNotationWorkspace") ? "Sheets" : "Drums") };
    if (name === "./GteWorkspace") return { __esModule: true, default: marker("Tab") };
    if (name.includes("gteNotation")) return { isNotationTrack };
    if (name.includes("gteDrums")) return { isDrumTrackType: () => false };
    return {};
  } });
  const render = (instrumentId: string, tabViewEnabled: boolean, practiceMode = false) => module.exports.default({ snapshot: { instrumentId }, tabViewEnabled, practiceMode }).type.displayName;
  expect(render("gm:piano", false)).toBe("Sheets");
  expect(render("gm:piano", true)).toBe("MIDI");
  expect(render("gm:piano", true, true)).toBe("Sheets");
  expect(render("gm:strings", true)).toBe("MIDI");
  expect(render("guitar", true)).toBe("Tab");
});
