import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import GteMidiWorkspace, { MidiPlayhead } from "../../components/GteMidiWorkspace";
import { buildNotationScore } from "../../lib/gteNotationScore";
import type { EditorSnapshot } from "../../types/gte";
import { readPitchedViewState, savePitchedViewState } from "../../lib/gtePitchedViewState";

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
  // React is imported before JSDOM and selects its legacy input-event shim.
  Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
});

it("loads delayed music, guards tiny drags, supports navigation, loop selection and restores editing context", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let snapshot: EditorSnapshot = { id: "delayed", instrumentId: "gm:piano", framesPerMessure: 480, fps: 240, totalFrames: 9600, timeSignature: 4, timeSignatureBottom: 4,
    notes: [60, 64, 72].map((midiNum, index) => ({ id: index + 1, startTime: 4800 + index * 120, length: 240, midiNum, tab: [0, 0], optimals: [], velocity: 0.6 })), chords: [], optimalsByTime: {}, cutPositionsWithCoords: [] };
  const changes = vi.fn(), loop = vi.fn();
  const render = async () => { await act(async () => root.render(React.createElement(GteMidiWorkspace, { editorId: "delayed-test", snapshot, isActive: true,
    onSnapshotChange: (next: EditorSnapshot) => { snapshot = next; changes(next); }, onMidiLoopRangeChange: loop }))); };
  const pointer = async (target: Element, type: string, x: number, y: number, extra = {}) => { await act(async () => target.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, ...extra }))); };
  try {
    await render();
    const scroll = host.querySelector('[data-midi-scroll]') as HTMLDivElement;
    expect(scroll.scrollLeft).toBeGreaterThan(0);
    expect(host.querySelectorAll('[data-midi-note]')).toHaveLength(3);
    const pianoWhite = host.querySelector('[aria-label="Audition C4"]') as HTMLButtonElement;
    const pianoBlack = host.querySelector('[aria-label="Audition C♯4"]') as HTMLButtonElement;
    expect(pianoWhite.style.width).toBe("100%"); expect(pianoBlack.style.width).toBe("65%");
    const note = host.querySelector('[data-midi-note="n:1"] rect')!;
    const x = Number(note.getAttribute("x")), y = Number(note.getAttribute("y"));
    const grid = host.querySelector('[aria-label="MIDI piano roll"]')!;
    await pointer(note, "pointerdown", x + 8, y + 4); await pointer(grid, "pointermove", x + 9, y + 5); await pointer(grid, "pointerup", x + 9, y + 5);
    expect(changes).not.toHaveBeenCalled();
    expect(host.querySelector('[data-midi-note="n:1"]')?.getAttribute("aria-pressed")).toBe("true");
    await pointer(host.querySelector('[data-midi-note="n:1"]')!, "contextmenu", x, y);
    expect(host.querySelector('[role="menu"]')).toBeTruthy();
    expect(host.querySelector('[role="menu"]')!.textContent).toContain("DuplicateCtrl+D");
    const beforeWidth = Number(host.querySelector('[data-midi-note="n:1"] rect')!.getAttribute("width"));
    await act(async () => scroll.dispatchEvent(new dom.window.WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -150, clientX: 400 })));
    expect(Number(host.querySelector('[data-midi-note="n:1"] rect')!.getAttribute("width"))).toBeGreaterThan(beforeWidth);
    const left = scroll.scrollLeft;
    await act(async () => scroll.dispatchEvent(new dom.window.WheelEvent("wheel", { bubbles: true, cancelable: true, shiftKey: true, deltaY: 90 })));
    expect(scroll.scrollLeft).toBe(left + 90);
    const ruler = host.querySelector('[aria-label="MIDI playhead"]')!;
    await pointer(ruler, "pointerdown", 100, 10); await pointer(ruler, "pointermove", 300, 10); await pointer(ruler, "pointerup", 300, 10);
    expect(loop).toHaveBeenCalledOnce();
    expect(loop.mock.calls[0][0].endFrame).toBeGreaterThan(loop.mock.calls[0][0].startFrame);
    const collapse = [...host.querySelectorAll("button")].find((button) => button.title === "Show or hide velocity lane")!;
    expect(collapse.getAttribute("aria-expanded")).toBe("false");
    scroll.scrollLeft = 420; scroll.scrollTop = 800;
    await act(async () => scroll.dispatchEvent(new dom.window.Event("scroll", { bubbles: true })));
    await act(async () => root.render(React.createElement("div", null, "Sheets")));
    expect(readPitchedViewState("delayed-test")).toMatchObject({ left: 420, top: 800, selection: ["n:1"], velocityHeight: 0 });
    await render();
    expect((host.querySelector('[data-midi-scroll]') as HTMLDivElement).scrollLeft).toBe(420);
    expect((host.querySelector('[data-midi-scroll]') as HTMLDivElement).scrollTop).toBe(800);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("focuses a dragged rectangle without selecting or editing the notes underneath", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const snapshot: EditorSnapshot = { id: "focus-test", fps: 240, framesPerMessure: 480, totalFrames: 1920, notes: [{ id: 1, startTime: 0, length: 120, midiNum: 60, tab: [0,0], optimals: [] }], chords: [], cutPositionsWithCoords: [], optimalsByTime: {} };
  const changes = vi.fn();
  const pointer = async (target: Element, type: string, x: number, y: number) => { await act(async () => target.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }))); };
  try {
    await act(async () => root.render(React.createElement(GteMidiWorkspace, { editorId: "focus-box-test", snapshot, isActive: true, onSnapshotChange: changes })));
    await act(async () => (host.querySelector('[data-midi-menu="view"]') as HTMLButtonElement).click());
    const button = [...host.querySelectorAll("button")].find(button => button.textContent === "Focus view")!;
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(host.querySelector('[role="status"]')!.textContent).toContain("Drag a box");
    const grid = host.querySelector('[aria-label="MIDI piano roll"]')!;
    const height = Number(grid.getAttribute("height"));
    await pointer(host.querySelector('[data-midi-note] rect')!, "pointerdown", 100, 600);
    await pointer(grid, "pointermove", 400, 900);
    await pointer(grid, "pointerup", 400, 900);
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(Number(grid.getAttribute("height"))).toBeGreaterThan(height);
    expect(host.querySelectorAll('[data-midi-note][aria-pressed="true"]')).toHaveLength(0);
    expect(changes).not.toHaveBeenCalled();
    await act(async () => grid.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "F", shiftKey: true, bubbles: true })));
    await act(async () => grid.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(host.querySelector('[role="status"]')).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("updates playback highlights and follow position from the audio clock without React commits", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const originalRaf = globalThis.requestAnimationFrame, originalCancel = globalThis.cancelAnimationFrame;
  const callbacks = new Map<number, FrameRequestCallback>(); let id = 0, frame = 0;
  globalThis.requestAnimationFrame = (callback) => { callbacks.set(++id, callback); return id; };
  globalThis.cancelAnimationFrame = (key) => { callbacks.delete(key); };
  const commits = vi.fn(), scroll = React.createRef<HTMLDivElement>();
  const notes = [{ key: "n:1", noteId: 1, member: 0, midi: 60, start: 0, length: 120, velocity: 0.5, staff: "treble" as const }];
  try {
    await act(async () => root.render(React.createElement(React.Profiler, { id: "midi-playback", onRender: commits }, React.createElement("div", { ref: scroll },
      React.createElement("button", { "data-midi-key": 60 }), React.createElement("svg", null,
      React.createElement(MidiPlayhead, { scale: 1, height: 300, row: 18, frame: 0, playing: true, getFrame: () => frame, notes, scroll, follow: true }))))));
    const count = commits.mock.calls.length;
    expect(host.querySelector('[data-midi-playing] rect')).toBeTruthy();
    expect(host.querySelector('[data-midi-key="60"]')?.getAttribute("data-playing")).toBe("true");
    for (let index = 0; index < 60; index++) { frame += 3; const pending = [...callbacks.values()]; callbacks.clear(); await act(async () => pending.forEach((callback) => callback(0))); }
    expect(host.querySelector('[data-midi-playhead]')!.getAttribute("x1")).toBe("180");
    expect(host.querySelector('[data-midi-playing] rect')).toBeNull();
    expect(host.querySelector('[data-midi-key="60"]')?.hasAttribute("data-playing")).toBe(false);
    frame = 2000;
    const pending = [...callbacks.values()]; callbacks.clear(); await act(async () => pending.forEach(callback => callback(0)));
    expect(scroll.current!.scrollLeft).toBeGreaterThan(0);
    const target = 2000 - (900 - 76) * 0.65;
    expect(scroll.current!.scrollLeft).toBeLessThan(target);
    const first = scroll.current!.scrollLeft;
    for (let index = 0; index < 100; index++) { const pending = [...callbacks.values()]; callbacks.clear(); await act(async () => pending.forEach(callback => callback(index * 16))); }
    expect(scroll.current!.scrollLeft).toBeGreaterThan(first);
    expect(scroll.current!.scrollLeft).toBeCloseTo(target, 0);
    expect(commits).toHaveBeenCalledTimes(count);
  } finally { await act(async () => root.unmount()); host.remove(); globalThis.requestAnimationFrame = originalRaf; globalThis.cancelAnimationFrame = originalCancel; }
});

it("renders thousands of overlapping notes as bounded overview paths without changing the arrangement", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const snapshot: EditorSnapshot = { id: "dense-midi", instrumentId: "gm:piano", framesPerMessure: 480, fps: 240, totalFrames: 120000, timeSignature: 4, timeSignatureBottom: 4,
    notes: Array.from({ length: 5000 }, (_, id) => ({ id: id + 1, startTime: id * 24, length: 48, midiNum: 60 + id % 12, tab: [0, 0], optimals: [], velocity: 0.5 })), chords: [], optimalsByTime: {}, cutPositionsWithCoords: [] };
  const changes = vi.fn();
  try {
    await act(async () => root.render(React.createElement(GteMidiWorkspace, { editorId: "dense-midi-test", snapshot, isActive: true, onSnapshotChange: changes })));
    expect(host.querySelector('[data-midi-density]')).toBeTruthy();
    expect(host.querySelectorAll('[data-midi-density] path').length).toBe(3);
    expect(host.querySelector('[data-midi-density] path')!.getAttribute("d")!.split("M").length).toBeGreaterThan(4000);
    expect(host.querySelectorAll("line").length).toBeLessThan(200);
    expect(host.querySelectorAll('[data-midi-note]').length).toBeLessThan(200);
    expect(snapshot.notes).toHaveLength(5000); expect(changes).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it.each([120, 480])("keeps group movement, key snapping and always-snapped resizing correct at %i px/bar", async (zoom) => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host), editorId = "zoom-edit-" + zoom;
  savePitchedViewState(editorId, { zoom, row: 18, left: 0, top: 1100, snap: true, grid: 16 });
  let snapshot: EditorSnapshot = { id: editorId, instrumentId: "gm:piano", framesPerMessure: 480, fps: 240, totalFrames: 480, timeSignature: 4, timeSignatureBottom: 4,
    notes: [60, 64].map((midiNum, index) => ({ id: index + 1, midiNum, startTime: 0, length: 120, velocity: 0.5, tab: [0, 0], optimals: [] })), chords: [], optimalsByTime: {}, cutPositionsWithCoords: [] };
  const render = async () => { await act(async () => root.render(React.createElement(GteMidiWorkspace, { editorId, snapshot, isActive: true, globalSnapToKeyEnabled: true, canvasKeyBase: 0, canvasKeyType: 0, onSnapshotChange: (next) => { snapshot = next; } }))); };
  const pointer = async (element: Element, kind: string, x: number, y: number, extra = {}) => { await act(async () => element.dispatchEvent(new dom.window.MouseEvent(kind, { bubbles: true, button: 0, clientX: x, clientY: y, ...extra }))); };
  const key = async (key: string, options = {}) => { await act(async () => host.querySelector('[data-gte-midi-editor]')!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { bubbles: true, key, ...options }))); };
  try {
    await render(); await key("a", { ctrlKey: true });
    const scale = zoom / 480, surface = () => host.querySelector('[aria-label="MIDI piano roll"]')!;
    const y = (127 - 60) * 18 + 6;
    await pointer(host.querySelector('[data-midi-note="n:1"] rect')!, "pointerdown", 8, y);
    await pointer(surface(), "pointermove", 8 + 30 * scale, y - 36); await pointer(surface(), "pointerup", 8 + 30 * scale, y - 36);
    expect(snapshot.notes.map((note) => [note.startTime, note.midiNum])).toEqual([[30, 62], [30, 65]]);
    await render();
    const edge = host.querySelector('[data-midi-note="n:1"]')!.querySelectorAll("rect")[2];
    const edgeX = 150 * scale - 1;
    await pointer(edge, "pointerdown", edgeX, y - 36); await pointer(surface(), "pointermove", edgeX + 6.25, y - 36, { altKey: true }); await pointer(surface(), "pointerup", edgeX + 6.25, y - 36, { altKey: true });
    const snappedLength = Math.round((150 + 6.25 / scale) / 30) * 30 - 30;
    expect(snapshot.notes.map((note) => note.length)).toEqual([snappedLength, snappedLength]);
    await render();
    await pointer(host.querySelector('[data-midi-note="n:1"] rect')!, "pointerdown", 30 * scale + 8, y - 36);
    await pointer(surface(), "pointermove", 30 * scale + 8, y - 54, { altKey: true }); await pointer(surface(), "pointerup", 30 * scale + 8, y - 54, { altKey: true });
    expect(snapshot.notes[0].midiNum).toBe(63);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
afterAll(() => { dom.window.close(); vi.unstubAllGlobals(); });

it("ignores saved snap-off settings, keeps Alt timing snapped and resizes/collapses the 0–127 velocity panel", async () => {
  const editorId = "layout-always-snap";
  savePitchedViewState(editorId, { snap: false, strength: 0, zoom: 240, row: 18, grid: 16, left: 0, top: 1100 });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let snapshot: EditorSnapshot = { id: "piano", instrumentId: "upright_piano", framesPerMessure: 480, fps: 240, totalFrames: 960,
    notes: [], chords: [], cutPositionsWithCoords: [], optimalsByTime: {} };
  const render = async () => { await act(async () => root.render(React.createElement(GteMidiWorkspace, { editorId, snapshot, isActive: true, onSnapshotChange: next => { snapshot = next; } }))); };
  const pointer = async (target: EventTarget, type: string, x: number, y: number) => { await act(async () => target.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, altKey: true }))); };
  try {
    await render();
    const roll = host.querySelector('[aria-label="MIDI piano roll"]')!, velocity = () => host.querySelector('[aria-label="MIDI velocity lane"]')!;
    expect(velocity().getAttribute("height")).toBe("0");
    expect(host.querySelector('[aria-label="Selected velocity"]')).toBeNull();
    await act(async () => (host.querySelector('[aria-label="Show or hide velocity lane"]') as HTMLButtonElement).click());
    expect(velocity().getAttribute("height")).toBe("100");
    expect(host.querySelector('[data-midi-velocity-header]')?.textContent).toContain("0–127");
    expect(host.querySelector('[aria-label="Snap"]')).toBeNull();
    await pointer(roll, "dblclick", 37, (127 - 60) * 18 + 6);
    expect(snapshot.notes[0]).toMatchObject({ startTime: 60, length: 30 });
    expect(snapshot.notes[0].velocity).toBe(100 / 127);
    await render();
    expect(host.querySelector('[aria-label="Selected velocity"]')?.closest('[data-midi-velocity-header]')).not.toBeNull();
    await pointer(velocity().querySelector("circle")!, "pointerdown", 30, 10);
    await pointer(velocity(), "pointermove", 30, 150); await pointer(velocity(), "pointerup", 30, 150);
    expect(snapshot.notes[0].velocity).toBe(30 / 127);
    await render();
    const handle = host.querySelector('[aria-label="Resize velocity lane"]')!;
    await act(async () => handle.dispatchEvent(new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowUp" })));
    expect(velocity().getAttribute("height")).toBe("110");
    const collapse = host.querySelector('[aria-label="Show or hide velocity lane"]') as HTMLButtonElement;
    await act(async () => collapse.click()); expect(velocity().getAttribute("height")).toBe("0");
    await act(async () => collapse.click()); expect(velocity().getAttribute("height")).toBe("110");
    await pointer(host.querySelector('[aria-label="Resize velocity lane"]')!, "pointerdown", 0, 100); await pointer(dom.window, "pointermove", 0, 80); await pointer(dom.window, "pointerup", 0, 80);
    expect(velocity().getAttribute("height")).toBe("130");
    expect((host.querySelector('[data-midi-scroll]') as HTMLElement).className).toContain("flex-1");
    expect(host.querySelector('[aria-label="MIDI playhead"]')?.parentElement?.className).toContain("sticky top-0");
  } finally { await act(async () => root.unmount()); host.remove(); }
  expect(readPitchedViewState(editorId)).toMatchObject({ snap: true, strength: 1 });
});

it("edits the real shared snapshot through draw, move, resize, selection, velocity, clipboard and undo controls", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let snapshot: EditorSnapshot = { id: "piano", instrumentId: "gm:piano", notes: [], chords: [], framesPerMessure: 480, fps: 240,
    totalFrames: 480, timeSignature: 4, timeSignatureBottom: 4, optimalsByTime: {}, cutPositionsWithCoords: [] };
  const changes = vi.fn(), undo = vi.fn(), redo = vi.fn(), seek = vi.fn();
  const render = async (disabled = false) => { await act(async () => root.render(React.createElement(GteMidiWorkspace, {
    editorId: "canvas__ed__piano", snapshot, isActive: true, editMenuDisabled: disabled, onSnapshotChange: (next: EditorSnapshot) => { snapshot = next; changes(next); },
    onRequestUndo: undo, onRequestRedo: redo, onGlobalPlaybackFrameChange: seek,
  }))); };
  const button = (text: string) => [...host.querySelectorAll("button")].find((button) => button.textContent === text || button.getAttribute("aria-label") === text)!;
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
    expect(snapshot.notes[0].velocity).toBe(100 / 127);
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
    await act(async () => (host.querySelector('[aria-label="Show or hide velocity lane"]') as HTMLButtonElement).click());
    const velocity = host.querySelector('[aria-label="Selected velocity"]') as HTMLInputElement;
    expect(velocity.value).toBe("100");
    // Replacing a value must not persist the intermediate empty input as zero.
    await act(async () => { velocity.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true })); });
    await act(async () => { velocity.value = ""; velocity.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    expect(snapshot.notes[0].velocity).toBe(100 / 127);
    await act(async () => { velocity.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true })); });
    expect(snapshot.notes[0].velocity).toBe(100 / 127);
    expect(velocity.value).toBe("100");
    const lane = host.querySelector('[aria-label="MIDI velocity lane"]')!;
    // Clicking near the foot of a stem selects it without silencing the notes.
    await pointer(lane.querySelector("circle")!, "pointerdown", 60, 95);
    await pointer(lane, "pointermove", 60, 96); await pointer(lane, "pointerup", 60, 96);
    expect(snapshot.notes[0].velocity).toBe(100 / 127);
    const velocityMiddle = Number(lane.getAttribute("height")) / 2;
    await pointer(lane.querySelector("circle")!, "pointerdown", 60, 25); await pointer(lane, "pointermove", 60, velocityMiddle); await pointer(lane, "pointerup", 60, velocityMiddle);
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
