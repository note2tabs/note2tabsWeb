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
  } finally { await act(async () => root.unmount()); host.remove(); }
  expect(callbacks.size).toBe(0);
});
