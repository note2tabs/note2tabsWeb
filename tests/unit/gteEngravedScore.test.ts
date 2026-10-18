import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
import { Element } from "vexflow/bravura";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import GteEngravedScore from "../../components/GteEngravedScore";
import { buildNotationScore } from "../../lib/gteNotationScore";
import type { EditorSnapshot } from "../../types/gte";

vi.mock("../../lib/i18n/react", () => ({ useLocale: () => ({ t: (value: string) => value }) }));
let dom: JSDOM;
beforeAll(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  Object.defineProperty(dom.window.HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1000 });
  for (const [file, family] of [["bravura", "Bravura"], ["academico", "Academico"]]) {
    const font = readFileSync(`node_modules/vexflow/build/esm/src/fonts/${file}.js`, "utf8");
    GlobalFonts.register(Buffer.from(font.match(/base64,([^']+)/)![1], "base64"), family);
  }
  Element.setTextMeasurementCanvas(createCanvas(400, 100) as unknown as HTMLCanvasElement);
});
afterAll(() => { dom.window.close(); vi.unstubAllGlobals(); });

it("renders actual engraved SVG and keeps it stable while playback and selection change", async () => {
  const snapshot: EditorSnapshot = { id: "score", instrumentId: "gm:piano", framesPerMessure: 480,
    totalFrames: 480, timeSignature: 4, timeSignatureBottom: 4, fps: 240,
    notes: [{ id: 1, midiNum: 66, startTime: 0, length: 120, tab: [0, 0], optimals: [] }],
    chords: [], cutPositionsWithCoords: [], optimalsByTime: {} };
  const score = buildNotationScore(snapshot, { keyBase: 4, keyType: 1 });
  const element = document.createElement("div"); document.body.append(element);
  const root = createRoot(element);
  const onSelect = vi.fn(), onPoint = vi.fn();
  const props = { score, input: true, disabled: false, guides: true, snapEnabled: true, denominator: 8,
    dotted: false, length: 60, cursor: null, selection: { noteIds: [], chordIds: [] }, playbackFrame: 0,
    playing: false, barsPerSystem: 4, showBarNumbers: true, transformPitch: (midi: number) => midi,
    onPoint, onSelect, onMove: vi.fn() };
  try {
    await act(async () => { root.render(React.createElement(GteEngravedScore, props)); });
    expect(element.querySelector('[role="alert"]')).toBeNull();
    const engraving = element.querySelector("svg")!;
    expect(engraving.querySelectorAll("path").length).toBeGreaterThan(5);
    const hit = element.querySelector('[role="button"]')!;
    expect(hit.getAttribute("aria-label")).toContain("f#/4");
    expect(Number(hit.getAttribute("x"))).toBeGreaterThan(100);
    const overlay = element.querySelector('[aria-label="Musical score"]')!;
    overlay.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0,
      width: Number(overlay.getAttribute("width")), height: Number(overlay.getAttribute("height")),
      right: Number(overlay.getAttribute("width")), bottom: Number(overlay.getAttribute("height")), toJSON() {} });
    const clientX = Number(hit.getAttribute("x")) + 30, clientY = Number(hit.getAttribute("y")) + 7;
    await act(async () => { overlay.dispatchEvent(new dom.window.MouseEvent("pointermove", { clientX, clientY, bubbles: true })); });
    expect(element.querySelector('[data-notation-preview="true"]')).not.toBeNull();
    await act(async () => { overlay.dispatchEvent(new dom.window.MouseEvent("pointerdown", { clientX, clientY, bubbles: true, button: 0 })); });
    expect(onPoint).toHaveBeenCalledOnce(); expect(onPoint.mock.calls[0][0].midi).toBe(66);
    onPoint.mockClear();
    await act(async () => { hit.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(onSelect).toHaveBeenCalledOnce(); expect(onPoint).not.toHaveBeenCalled();
    await act(async () => { root.render(React.createElement(GteEngravedScore, { ...props,
      playbackFrame: 60, playing: true, selection: { noteIds: [1], chordIds: [] } })); });
    expect(element.querySelector("svg")).toBe(engraving);
    expect(element.querySelector('[aria-pressed="true"]')).not.toBeNull();
    expect(snapshot.notes[0].midiNum).toBe(66);
  } finally { await act(async () => root.unmount()); element.remove(); }
});
