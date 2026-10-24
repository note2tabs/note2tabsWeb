import React, { act, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import GteNotationPlayback from "../../components/GteNotationPlayback";
import { buildNotationScore } from "../../lib/gteNotationScore";
import type { EngravedLayout } from "../../lib/gteNotationEngraving";

let dom: JSDOM;
const callbacks = new Map<number, FrameRequestCallback>(); let nextId = 0;
beforeAll(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  dom.window.requestAnimationFrame = (callback) => { callbacks.set(++nextId, callback); return nextId; };
  dom.window.cancelAnimationFrame = (id) => { callbacks.delete(id); };
});
afterAll(() => { dom.window.close(); vi.unstubAllGlobals(); });

it.each([false, true])("follows successive systems from the live audio clock with empty SVG line bounds (nested=%s)", async nested => {
  const score = buildNotationScore({ id: "follow", framesPerMessure: 480, fps: 240, totalFrames: 1440,
    timeSignature: 4, timeSignatureBottom: 4, notes: Array.from({ length: 3 }, (_, id) => ({ id, startTime: id * 480, length: 120, midiNum: 72, tab: [0, 0] as [number, number], optimals: [] })), chords: [], optimalsByTime: {}, cutPositionsWithCoords: [] });
  const layout: EngravedLayout = { width: 800, height: 1400, hits: [], beamCount: 0, tieCount: 0, tupletCount: 0,
    measures: Array.from({ length: 3 }, (_, index) => ({ index, x: 40, width: 700, top: 100 + index * 400, bottom: 300 + index * 400,
      staffBottom: { treble: 140 + index * 400, bass: 260 + index * 400 }, startX: 50, endX: 730,
      columns: [{ tick: index * score.barTicks, x: 50 }, { tick: (index + 1) * score.barTicks, x: 730 }] })) };
  // VexFlow's pre-draw modifier union can report an origin-relative box Y,
  // even though the actual heads are correctly placed in each later system.
  layout.hits = layout.measures.map(measure => ({
    token: score.measures[measure.index].voices.treble[0].find(token => !token.rest)!, x: 50,
    box: { x: 50, y: -14, width: 12, height: 60 },
    heads: [{ x: 50, y: measure.top + 40, midi: 72 }],
  }));
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let frame = 0, offset = 0;
  const scroll = vi.fn((options?: ScrollToOptions | number, y?: number) => { offset += typeof options === "number" ? y ?? 0 : options?.top ?? 0; });
  dom.window.scrollBy = scroll;
  if (nested) {
    host.style.overflowY = "auto";
    Object.defineProperty(host, "scrollHeight", { value: 1600 }); Object.defineProperty(host, "clientHeight", { value: 600 });
    host.getBoundingClientRect = () => ({ top: 0, bottom: 700 } as DOMRect);
    host.scrollBy = scroll;
  }
  try {
    await act(async () => root.render(React.createElement("svg", null,
      React.createElement(GteNotationPlayback, { layout, score, frame: 0, playing: true, getFrame: () => frame }))));
    host.querySelector("svg")!.getBoundingClientRect = () => ({ top: 200 - offset, bottom: 1600 - offset, height: 1400 } as DOMRect);
    const tick = async () => { const pending = [...callbacks.values()]; callbacks.clear(); await act(async () => pending.forEach(callback => callback(0))); };
    await tick(); const firstOffset = offset;
    frame = 480; await tick(); expect(offset).toBeGreaterThan(firstOffset + 300);
    const secondOffset = offset;
    frame = 960; await tick(); expect(offset).toBeGreaterThan(secondOffset + 300);
    expect(scroll).toHaveBeenCalledTimes(3);
    expect(host.querySelector("line")!.getAttribute("y1")).toBe("900");
    // Final system remains below the header margin, not hidden above it.
    expect(200 - offset + 900 - 48).toBeCloseTo(16);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("moves smoothly from the live clock and updates sounding notes without React commits", async () => {
  const score = buildNotationScore({ id: "piano", framesPerMessure: 480, fps: 240, totalFrames: 480,
    timeSignature: 4, timeSignatureBottom: 4, notes: [{ id: 1, startTime: 0, length: 120, midiNum: 72, tab: [0, 0], optimals: [] }],
    chords: [], optimalsByTime: {}, cutPositionsWithCoords: [] });
  const token = score.measures[0].voices.treble[0][0];
  const layout: EngravedLayout = { width: 500, height: 100, beamCount: 0, tieCount: 0, tupletCount: 0,
    hits: [{ token, x: 20, heads: [{ x: 20, y: 20, midi: 72 }], box: { x: 20, y: 20, width: 10, height: 10 } }],
    measures: [{ index: 0, x: 0, width: 420, top: 0, bottom: 80, staffBottom: { treble: 40, bass: 80 },
      startX: 10, endX: 410, columns: [{ tick: 0, x: 10 }, { tick: 384, x: 410 }] }] };
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let clock = 0; const getFrame = () => clock, commits = vi.fn();
  const render = async (frame: number, playing: boolean) => {
    await act(async () => root.render(React.createElement(Profiler, { id: "playback", onRender: commits },
      React.createElement("svg", null, React.createElement(GteNotationPlayback, { layout, score, frame, playing, getFrame })))));
  };
  const tick = async () => { const pending = [...callbacks.values()]; callbacks.clear(); await act(async () => pending.forEach((callback) => callback(0))); };
  try {
    await render(0, true);
    const line = host.querySelector("line")!;
    expect(line.getAttribute("x1")).toBe("10"); expect(host.querySelectorAll("ellipse")).toHaveLength(1);
    const count = commits.mock.calls.length;
    clock = 60; await tick(); expect(line.getAttribute("x1")).toBe("60");
    clock = 120; await tick(); expect(line.getAttribute("x1")).toBe("110");
    expect(host.querySelectorAll("ellipse")).toHaveLength(0);
    for (clock = 121; clock < 180; clock++) await tick();
    expect(commits).toHaveBeenCalledTimes(count);
    clock = 180; await render(180, false);
    expect(callbacks.size).toBe(0); expect(line.getAttribute("x1")).toBe("160");
    clock = 240; await render(240, false); expect(line.getAttribute("x1")).toBe("210");
    clock = 480; await render(480, false); expect(line.style.display).toBe("none");
    const offscreenReads = vi.fn();
    const dense: EngravedLayout = { ...layout, hits: [...layout.hits], measures: [...layout.measures] };
    for (let index = 1; index < 500; index++) {
      const offscreenToken = { ...token, tick: index * 384 };
      Object.defineProperty(offscreenToken, "pitches", { get: () => { offscreenReads(); return token.pitches; } });
      dense.hits.push({ ...layout.hits[0], token: offscreenToken });
      dense.measures.push({ ...layout.measures[0], index });
    }
    clock = 0;
    await act(async () => root.render(React.createElement("svg", null,
      React.createElement(GteNotationPlayback, { layout: dense, score, frame: 0, playing: true, getFrame }))));
    for (clock = 0; clock < 60; clock++) await tick();
    expect(offscreenReads).not.toHaveBeenCalled();
    // Follow an off-screen system once, not once per animation frame.
    const followLine = host.querySelector("line")!;
    const scrollIntoView = vi.fn();
    dom.window.scrollBy = scrollIntoView;
    Object.assign(followLine, { scrollIntoView, getBoundingClientRect: () => ({ top: 1200, bottom: 1280, height: 80 }) });
    const nextSystem = { ...dense, measures: dense.measures.map(measure => ({ ...measure, top: 300, bottom: 380 })) };
    await act(async () => root.render(React.createElement("svg", null,
      React.createElement(GteNotationPlayback, { layout: nextSystem, score, frame: 0, playing: true, getFrame }))));
    expect(scrollIntoView).toHaveBeenCalledOnce();
    await tick(); await tick();
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenLastCalledWith({ top: expect.any(Number), behavior: "smooth" });
    // Leave room above the staff for bar numbers, tall stems and beams.
    expect(scrollIntoView.mock.calls[0][0].top).toBeLessThanOrEqual(1200 - 64);
    // Advance before the next system is hidden, even while this one fits.
    scrollIntoView.mockClear();
    Object.assign(followLine, { getBoundingClientRect: () => ({ top: 100, bottom: 180, height: 80 }) });
    const previewLayout = { ...dense, measures: dense.measures.map((measure,index) => ({ ...measure, top: index ? 900 : 0, bottom: index ? 980 : 80 })) };
    await act(async () => root.render(React.createElement("svg", null,
      React.createElement(GteNotationPlayback, { layout: previewLayout, score, frame: 0, playing: true, getFrame }))));
    expect(scrollIntoView).toHaveBeenCalledOnce();
    // Newly visible sheets must retry a row measured before layout completed.
    scrollIntoView.mockClear();
    const delayedLayout = { ...previewLayout, measures: [...previewLayout.measures] };
    Object.assign(followLine, { getBoundingClientRect: () => ({ top: 0, bottom: 0, height: 0 }) });
    await act(async () => root.render(React.createElement("svg", null,
      React.createElement(GteNotationPlayback, { layout: delayedLayout, score, frame: 61, playing: true, getFrame }))));
    expect(scrollIntoView).not.toHaveBeenCalled();
    Object.assign(followLine, { getBoundingClientRect: () => ({ top: 1200, bottom: 1280, height: 80 }) });
    await tick();
    expect(scrollIntoView).toHaveBeenCalledOnce();
    clock = 61;
    await act(async () => root.render(React.createElement("svg", null,
      React.createElement(GteNotationPlayback, { layout: delayedLayout, score, frame: 61, playing: true, getFrame }))));
    await tick();
    expect(scrollIntoView).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); host.remove(); }
  expect(callbacks.size).toBe(0);
});
