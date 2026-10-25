import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { Element } from "vexflow/bravura";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { EditorSnapshot } from "../../types/gte";
vi.mock("../../lib/i18n/react", () => ({ useLocale: () => ({ t: (value: string) => value }) }));
vi.mock("../../lib/gteSamplePlayback", () => ({ prepareTrackInstrument: vi.fn(), schedulePreparedTrackNote: vi.fn() }));
import Workspace from "../../components/GteNotationWorkspace";

it("redraws actual SVG stems after bulk voice changes through the real Sheets toolbar", async () => {
  const dom = new JSDOM("<html><body><div id='root'></div></body></html>", { pretendToBeVisual: true });
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", () => 1); vi.stubGlobal("cancelAnimationFrame", () => {});
  Object.defineProperty(dom.window.HTMLElement.prototype, "clientWidth", { get: () => 1400, configurable: true });
  for (const [file, family] of [["bravura", "Bravura"], ["academico", "Academico"]]) {
    const font = readFileSync("node_modules/vexflow/build/esm/src/fonts/" + file + ".js", "utf8");
    GlobalFonts.register(Buffer.from(font.match(/base64,([^']+)/)![1], "base64"), family);
  }
  Element.setTextMeasurementCanvas(createCanvas(400,100) as unknown as HTMLCanvasElement);
  const base: EditorSnapshot = { id: "svg-voices", instrumentType: "notation", fps: 240, framesPerMessure: 480, totalFrames: 960,
    notes: [], chords: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, originalMidi: [48,55,60], currentTabs: [[0,0],[1,0],[2,0]], ogTabs: [], startTime: i * 60, length: 60, notationVoice: 1 })), cutPositionsWithCoords: [], optimalsByTime: {} };
  let snapshot = base;
  function Harness() {
    const [track, update] = useState(base); snapshot = track;
    return React.createElement(Workspace, { editorId: "svg-voices", snapshot: track, isActive: true, onSnapshotChange: (next: EditorSnapshot) => update({ ...next,
      notes: next.notes.map(({ notationVoiceSource, ...note }) => note),
      chords: next.chords.map(({ notationVoiceSource, ...chord }) => chord),
    }) });
  }
  const root = createRoot(document.getElementById("root")!);
  const stems = () => [...document.querySelectorAll(".vf-stem path")].map(path => {
    const points = path.getAttribute("d")!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    return Math.sign(points[3] - points[1]);
  });
  try {
    await act(async () => root.render(React.createElement(Harness)));
    expect(document.querySelector('[role="alert"]')?.textContent).toBeUndefined();
    expect(stems().length).toBeGreaterThan(0);
    await act(async () => document.querySelector('[data-gte-notation-editor]')!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true })));
    for (const voice of [1,2,1]) {
      await act(async () => (document.querySelector(`[aria-label='Voice ${voice}']`) as HTMLButtonElement).click());
      expect(snapshot.chords.every(chord => chord.notationVoice === voice)).toBe(true);
      expect(stems().length).toBeGreaterThan(0);
      expect(stems().every(direction => direction === (voice === 1 ? -1 : 1))).toBe(true);
    }
  } finally { await act(async () => root.unmount()); dom.window.close(); vi.unstubAllGlobals(); }
});
