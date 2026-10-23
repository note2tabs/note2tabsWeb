import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import GteMidiWorkspace from "../../components/GteMidiWorkspace";
import { buildNotationScore } from "../../lib/gteNotationScore";
import type { EditorSnapshot } from "../../types/gte";

vi.mock("../../lib/i18n/react", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
vi.mock("../../lib/gteSamplePlayback", () => ({ prepareTrackInstrument: vi.fn(), schedulePreparedTrackNote: vi.fn() }));
let dom: JSDOM;
beforeAll(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1)); vi.stubGlobal("cancelAnimationFrame", vi.fn());
  Object.defineProperty(dom.window.HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 900 });
  Object.defineProperty(dom.window.HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 480 });
  dom.window.SVGElement.prototype.setPointerCapture = vi.fn(); dom.window.SVGElement.prototype.releasePointerCapture = vi.fn();
});
afterAll(() => { dom.window.close(); vi.unstubAllGlobals(); });

it("edits the real shared snapshot through draw, move, resize, selection, velocity, clipboard and undo controls", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let snapshot: EditorSnapshot = { id: "piano", instrumentId: "gm:piano", notes: [], chords: [], framesPerMessure: 480, fps: 240,
    totalFrames: 480, timeSignature: 4, timeSignatureBottom: 4, optimalsByTime: {}, cutPositionsWithCoords: [] };
  const changes = vi.fn(), undo = vi.fn(), redo = vi.fn(), seek = vi.fn();
  const render = async (disabled = false) => { await act(async () => root.render(React.createElement(GteMidiWorkspace, {
    editorId: "canvas__ed__piano", snapshot, isActive: true, editMenuDisabled: disabled, onSnapshotChange: (next: EditorSnapshot) => { snapshot = next; changes(next); },
    onRequestUndo: undo, onRequestRedo: redo, onGlobalPlaybackFrameChange: seek,
  }))); };
  const button = (text: string) => [...host.querySelectorAll("button")].find((button) => button.textContent === text)!;
  const grid = () => host.querySelector('[aria-label="MIDI piano roll"]')!;
  const pointer = async (target: Element, type: string, x: number, y: number, extra = {}) => {
    await act(async () => target.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, ...extra })));
  };
  const key = async (value: string, extra = {}) => { await act(async () => host.querySelector('[data-gte-midi-editor]')!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: value, bubbles: true, ...extra }))); };
  const click = async (text: string) => { await act(async () => button(text).click()); };
  try {
    await render();
    expect(host.querySelectorAll('[data-midi-note]')).toHaveLength(0);
    await click("Draw");
    const y = (127 - 60) * 18 + 8;
    await pointer(grid(), "pointerdown", 30, y); await pointer(grid(), "pointermove", 60, y); await pointer(grid(), "pointerup", 60, y);
    expect(snapshot.notes).toHaveLength(1); expect(snapshot.notes[0]).toMatchObject({ midiNum: 60, startTime: 60, length: 90 });
    expect(changes).toHaveBeenCalledTimes(1);
    await render(); await click("Select");
    const note = () => host.querySelector('[data-midi-note]')!;
    await pointer(note().querySelector("rect")!, "pointerdown", 35, y); await pointer(grid(), "pointermove", 65, y - 18); await pointer(grid(), "pointerup", 65, y - 18);
    expect(snapshot.notes[0]).toMatchObject({ midiNum: 61, startTime: 120, length: 90 });
    expect(changes).toHaveBeenCalledTimes(2);
    await render();
    await pointer(note().querySelectorAll("rect")[2], "pointerdown", 105, y - 18); await pointer(grid(), "pointermove", 135, y - 18); await pointer(grid(), "pointerup", 135, y - 18);
    expect(snapshot.notes[0].length).toBe(150);
    await render();
    const velocity = host.querySelector('[aria-label="Selected velocity"]') as HTMLInputElement;
    expect(velocity.value).toBe("100");
    const lane = host.querySelector('[aria-label="MIDI velocity lane"]')!;
    await pointer(lane.querySelector("circle")!, "pointerdown", 60, 25); await pointer(lane, "pointermove", 60, 36); await pointer(lane, "pointerup", 60, 36);
    expect(snapshot.notes[0].velocity).toBeCloseTo(0.5);
    await render();
    await key("c", { ctrlKey: true }); await key("v", { ctrlKey: true });
    expect(snapshot.notes).toHaveLength(2);
    await render(); await key("z", { ctrlKey: true }); await key("z", { ctrlKey: true, shiftKey: true });
    expect(undo).toHaveBeenCalledOnce(); expect(redo).toHaveBeenCalledOnce();
    // Sheet engraving consumes exactly these edited notes; no conversion snapshot exists.
    expect(buildNotationScore(snapshot).measures[0].voices.treble[0].some((token) => token.pitches.some((pitch) => pitch.midi === 61))).toBe(true);
    await key("Escape");
    await pointer(grid(), "pointerdown", 0, y - 22); await pointer(grid(), "pointermove", 200, y); await pointer(grid(), "pointerup", 200, y);
    expect(host.querySelectorAll('[data-midi-note][aria-pressed="true"]').length).toBe(2);
    await key("Delete"); expect(snapshot.notes).toHaveLength(0);
    await render(true); await pointer(grid(), "dblclick", 100, y); expect(snapshot.notes).toHaveLength(0);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
