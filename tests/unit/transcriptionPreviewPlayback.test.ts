// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useTranscriptionPreviewPlayback } from "../../components/useTranscriptionPreviewPlayback";
import type { CanvasSnapshot } from "../../types/gte";
const mocks = vi.hoisted(() => ({ prepare: vi.fn(), schedule: vi.fn() }));
vi.mock("../../lib/gteSamplePlayback", () => ({ prepareTrackInstrument: mocks.prepare, schedulePreparedTrackNote: mocks.schedule }));
vi.mock("../../lib/gteDrumPlayback", () => ({ prepareDrumKit: vi.fn(), schedulePreparedDrumHit: vi.fn() }));
class Context {
  static current: Context;
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {}); close = vi.fn(async () => {});
  disconnect = vi.fn();
  createGain = () => ({ gain: { value: 1 }, connect() {}, disconnect: this.disconnect });
  constructor() { Context.current = this; }
}
const song: CanvasSnapshot = { id: "preview", secondsPerBar: 2, editors: [{ id: "piano", instrumentType: "notation", instrumentId: "upright_piano", framesPerMessure: 480,
  fps: 240, totalFrames: 480, notes: [{ id: 1, startTime: 0, length: 240, midiNum: 60, tab: [0, 0], optimals: [] }], chords: [], cutPositionsWithCoords: [], optimalsByTime: {} }] };
let api: ReturnType<typeof useTranscriptionPreviewPlayback>;
let host: HTMLDivElement, root: Root;
function Harness({ canvas }: { canvas: CanvasSnapshot }) { api = useTranscriptionPreviewPlayback(canvas); return null; }
beforeEach(async () => {
  vi.useFakeTimers(); vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("AudioContext", Context);
  mocks.prepare.mockResolvedValue({});
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(React.createElement(Harness, { canvas: song })));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("waits for samples, pauses at the current position and preserves the clock across preview arrivals", async () => {
  let ready!: (value: unknown) => void;
  mocks.prepare.mockImplementationOnce(() => new Promise(resolve => { ready = resolve; }));
  await act(async () => api.toggle());
  Context.current.currentTime = 5;
  expect(api.getSeconds()).toBe(0);
  await act(async () => ready({}));
  Context.current.currentTime = 5.53;
  expect(api.getSeconds()).toBeCloseTo(.5);
  await act(async () => root.render(React.createElement(Harness, { canvas: structuredClone(song) })));
  expect(api.getSeconds()).toBeCloseTo(.5);
  await act(async () => api.pause());
  const position = api.getSeconds(); Context.current.currentTime = 10;
  expect(api.getSeconds()).toBe(position);
  expect(Context.current.disconnect).toHaveBeenCalled();
});
it("seeks and changes speed without restarting, then restarts from zero after the last note", async () => {
  await act(async () => api.toggle());
  Context.current.currentTime = .53;
  await act(async () => api.changeSpeed(.5));
  Context.current.currentTime = 1.06;
  expect(api.getSeconds()).toBeCloseTo(.75);
  await act(async () => api.seek(.25));
  expect(api.getSeconds()).toBeCloseTo(.25);
  Context.current.currentTime = 4;
  await act(async () => vi.advanceTimersByTime(40));
  expect(api.playing).toBe(false);
  await act(async () => api.toggle());
  expect(api.getSeconds()).toBe(0);
  expect(mocks.schedule).toHaveBeenCalled();
});
