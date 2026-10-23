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
  dom.window.requestAnimationFrame = vi.fn(() => 1);
  dom.window.cancelAnimationFrame = vi.fn();
  Object.defineProperty(dom.window.HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1000 });
  for (const [file, family] of [["bravura", "Bravura"], ["academico", "Academico"]]) {
    const font = readFileSync(`node_modules/vexflow/build/esm/src/fonts/${file}.js`, "utf8");
    GlobalFonts.register(Buffer.from(font.match(/base64,([^']+)/)![1], "base64"), family);
  }
  Element.setTextMeasurementCanvas(createCanvas(400, 100) as unknown as HTMLCanvasElement);
});
afterAll(() => { dom.window.close(); vi.unstubAllGlobals(); });

it("renders selectable bar headers and drag boundaries without intercepting note input or rebuilding engraving", async () => {
  const snapshot: EditorSnapshot = { id: "piano", instrumentId: "gm:piano", framesPerMessure: 480, totalFrames: 960, fps: 240,
    notes: [], chords: [], cutPositionsWithCoords: [], optimalsByTime: {} };
  const element = document.createElement("div"); document.body.append(element);
  const root = createRoot(element), onBarSelect = vi.fn(), onPoint = vi.fn(), onBarContextMenu = vi.fn(), onBarDrop = vi.fn(), onBarDragStart = vi.fn();
  const props = { score: buildNotationScore(snapshot), input: true, disabled: false, snapEnabled: true, denominator: 8, dotted: false, length: 60,
    cursor: null, selection: { noteIds: [], chordIds: [] }, playbackFrame: 0, playing: false, barsPerSystem: 4, showBarNumbers: true,
    transformPitch: (midi: number) => midi, onPoint, onSelect: vi.fn(), onMove: vi.fn(), editorId: "score__ed__piano",
    selectedBars: [0], onBarSelect, onBarContextMenu, onBarDragStart, onBarDrop, barDragging: true };
  try {
    await act(async () => { root.render(React.createElement(GteEngravedScore, props)); });
    const engraving = element.querySelector("svg"), headers = element.querySelectorAll<HTMLButtonElement>("[data-bar-select]");
    expect(headers.length).toBe(2);
    expect(headers[0].draggable).toBe(true); expect(headers[1].draggable).toBe(false);
    expect(headers[0].getAttribute("aria-pressed")).toBe("true");
    expect(headers[0].dataset.barSelectEditor).toBe("score__ed__piano");
    await act(async () => { headers[1].dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, shiftKey: true })); });
    expect(onBarSelect).toHaveBeenCalledWith(1, expect.objectContaining({ shiftKey: true }));
    expect(onPoint).not.toHaveBeenCalled();
    await act(async () => { headers[0].dispatchEvent(new dom.window.MouseEvent("contextmenu", { bubbles: true })); });
    expect(onBarContextMenu).toHaveBeenCalledWith(0, expect.anything());
    const transfer = { effectAllowed: "", dropEffect: "", setData: vi.fn() };
    const drag = async (target: EventTarget, type: string) => {
      const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: transfer });
      await act(async () => { target.dispatchEvent(event); });
    };
    await drag(headers[0], "dragstart"); expect(onBarDragStart).toHaveBeenCalledWith(0, expect.anything());
    const target = element.querySelector('[data-notation-bar-drop="2"]')!;
    expect(target).not.toBeNull();
    await drag(target, "dragover"); expect(transfer.dropEffect).toBe("move");
    await drag(target, "drop"); expect(onBarDrop).toHaveBeenCalledExactlyOnceWith(2);
    await act(async () => { root.render(React.createElement(GteEngravedScore, { ...props, selectedBars: [1], barDragging: false })); });
    expect(element.querySelector("svg")).toBe(engraving);
    expect(element.querySelector('[data-notation-selected-bar="1"]')).not.toBeNull();
    expect(element.querySelector('[data-notation-bar-drop]')).toBeNull();
    await act(async () => { root.render(React.createElement(GteEngravedScore, { ...props, disabled: true })); });
    expect(element.querySelector('[data-bar-select]')).toBeNull();
    expect(element.querySelector('[data-notation-bar-drop]')).toBeNull();
  } finally { await act(async () => root.unmount()); element.remove(); }
});

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
    onPoint, onSelect, onMove: vi.fn(), onAudition: vi.fn() };
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
    await act(async () => { root.render(React.createElement(GteEngravedScore, { ...props,
      selection: { noteIds: [1], chordIds: [] } })); });
    (overlay as SVGSVGElement).setPointerCapture = vi.fn();
    const x = Number(hit.getAttribute("x")) + 9, y = Number(hit.getAttribute("y")) + 7;
    const pointer = async (target: EventTarget, type: string, clientX: number, clientY: number) => {
      await act(async () => { target.dispatchEvent(new dom.window.MouseEvent(type, { clientX, clientY, bubbles: true, button: 0 })); });
    };
    await pointer(hit, "pointerdown", x, y);
    await pointer(overlay, "pointermove", x, y - 5);
    expect(props.onAudition).toHaveBeenCalledExactlyOnceWith(68);
    expect(props.onMove).not.toHaveBeenCalled();
    expect(snapshot.notes[0].midiNum).toBe(66);
    await pointer(overlay, "pointermove", x + 1, y - 5);
    expect(props.onAudition).toHaveBeenCalledTimes(1);
    await pointer(overlay, "pointerup", x + 1, y - 5);
    expect(props.onAudition.mock.calls.map(([midi]) => midi)).toEqual([68, 68]);
    expect(props.onMove).toHaveBeenCalledOnce();
    const onBoxSelect = vi.fn();
    await act(async () => { root.render(React.createElement(GteEngravedScore, { ...props, input: false, onBoxSelect })); });
    onPoint.mockClear();
    await pointer(overlay, "pointerdown", x - 18, y - 12);
    await pointer(overlay, "pointermove", x + 18, y + 12);
    expect(element.querySelector('[data-notation-selection-box="true"]')).not.toBeNull();
    await pointer(overlay, "pointerup", x + 18, y + 12);
    expect(onBoxSelect).toHaveBeenCalledOnce();
    expect(onBoxSelect.mock.calls[0][0].map((source: any) => source.noteId)).toEqual([1]);
    expect(onBoxSelect.mock.calls[0][1]).toBe(false);
    expect(onPoint).not.toHaveBeenCalled();
    expect(element.querySelector('[data-notation-selection-box="true"]')).toBeNull();
    await pointer(overlay, "pointerdown", x + 18, y + 12);
    await pointer(overlay, "pointermove", x - 18, y - 12);
    await act(async () => { dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" })); });
    await pointer(overlay, "pointerup", x - 18, y - 12);
    expect(onBoxSelect).toHaveBeenCalledOnce();
    expect(element.querySelector('[data-notation-selection-box="true"]')).toBeNull();
    expect(props.onMove.mock.calls[0][2]).toBe(2);
    await pointer(hit, "pointerdown", x, y);
    await pointer(overlay, "pointermove", x, y + 5);
    expect(props.onAudition).toHaveBeenLastCalledWith(65);
    const auditions = props.onAudition.mock.calls.length;
    await pointer(overlay, "pointercancel", x, y + 5);
    await pointer(overlay, "pointerup", x, y + 5);
    expect(props.onAudition).toHaveBeenCalledTimes(auditions);
    expect(props.onMove).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); element.remove(); }
});
