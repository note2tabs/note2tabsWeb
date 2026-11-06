// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { TranscriptionPreviewMetadata } from "../../lib/transcriptionPreviewProtocol";
const mocks = vi.hoisted(() => ({ render: vi.fn(), toggle: vi.fn(), pause: vi.fn(), seek: vi.fn() }));
vi.mock("next/dynamic", () => ({ default: () => (props: any) => { mocks.render(props); return null; } }));
vi.mock("../../components/useTranscriptionPreviewPlayback", () => ({ useTranscriptionPreviewPlayback: () => ({ playing: false, speed: 1, position: 0,
  getFrame: () => 0, getSeconds: () => 0, toggle: mocks.toggle, pause: mocks.pause, seek: mocks.seek, changeSpeed: vi.fn(), error: "" }) }));
import Preview from "../../components/TranscriptionStreamingPreview";

class WorkerStub {
  static current: WorkerStub;
  onmessage: ((event: any) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn(); terminate = vi.fn();
  constructor() { WorkerStub.current = this; }
}
let host: HTMLDivElement, root: Root;
const metadata: TranscriptionPreviewMetadata = { version: 1, streamId: "attempt", revision: 1, processedSeconds: 1, durationSeconds: 10, complete: false };
const canvas = { id: "preview", editors: [{ id: "lane", name: "Piano", instrumentType: "notation", notes: [], chords: [], fps: 240, totalFrames: 480 }] };
beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks(); vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("Worker", WorkerStub);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...metadata, tracks: [] }))));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const render = async (value: TranscriptionPreviewMetadata | null = metadata, finishing = false) => act(async () => root.render(React.createElement(Preview, { jobId: "job", name: "Song", metadata: value, finishing })));
it("waits without extra API calls before the first note and uses a simple progress banner", async () => {
  await render(null);
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ streaming: expect.objectContaining({ name: "Song", progress: 0 }) }));
});
it("mounts the real editor workspace and does not introduce separate preview transport or tabs", async () => {
  await render();
  await act(async () => WorkerStub.current.onmessage?.({ data: { request: "attempt:1", canvas } }));
  expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ editorId: "stream-job", isGuestMode: false, streaming: expect.objectContaining({ finishing: false }) }));
  expect(host.querySelector("select")).toBeNull(); expect(host.querySelector("footer")).toBeNull();
  await render({ ...metadata }); expect(fetch).toHaveBeenCalledTimes(1);
});
it("discards stale worker results and keeps the preview visible during final import", async () => {
  await render(); await render({ ...metadata, revision: 2 }, true);
  await act(async () => WorkerStub.current.onmessage?.({ data: { request: "attempt:1", canvas } }));
  expect(mocks.render.mock.calls.at(-1)![0].streaming.canvas.editors[0].id).toBe("awaiting-first-track");
  await act(async () => WorkerStub.current.onmessage?.({ data: { request: "attempt:2", canvas } }));
  expect(mocks.render).toHaveBeenCalled();
  expect(mocks.render.mock.calls.at(-1)![0].streaming.finishing).toBe(true);
  expect(host.querySelector('button[disabled]')).toBeNull();
});
it("keeps user changes and undo/redo separate from arriving notes, with no save requests", async () => {
  const source = { ...canvas, editors: [{ ...canvas.editors[0], program: 0, trackType: "tab", cutPositionsWithCoords: [], optimalsByTime: {},
    notes: [{ id: -1, startTime: 0, length: 60, midiNum: 60, tab: [0, 0], optimals: [] }] }] };
  await render();
  await act(async () => WorkerStub.current.onmessage?.({ data: { request: "attempt:1", canvas: source } }));
  const changed = structuredClone(source.editors[0]); changed.notes[0].midiNum = 72;
  await act(async () => mocks.render.mock.calls.at(-1)![0].streaming.onChange(source, { ...source, editors: [changed] }));
  expect(JSON.parse(window.localStorage.getItem("note2tabs:stream-edits:v1:job")!).tracks[0].events).toHaveLength(1);
  const incoming = structuredClone(source); incoming.editors[0].notes.push({ ...incoming.editors[0].notes[0], id: -99, startTime: 600, midiNum: 65 });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...metadata, revision: 2, tracks: [] }))));
  await render({ ...metadata, revision: 2 });
  await act(async () => WorkerStub.current.onmessage?.({ data: { request: "attempt:2", canvas: incoming } }));
  let props = mocks.render.mock.calls.at(-1)![0];
  expect(props.streaming.canvas.editors[0].notes.map((note: any) => note.midiNum)).toEqual([72, 65]);
  await act(async () => props.streaming.undo()); props = mocks.render.mock.calls.at(-1)![0];
  expect(props.streaming.canvas.editors[0].notes.map((note: any) => note.midiNum)).toEqual([60, 65]);
  await act(async () => props.streaming.redo());
  expect(mocks.render.mock.calls.at(-1)![0].streaming.canvas.editors[0].notes.map((note: any) => note.midiNum)).toEqual([72, 65]);
  expect(vi.mocked(fetch).mock.calls.every(call => !call[1]?.method || call[1].method === "GET")).toBe(true);
});
it("restores local edits after a retry and disables editing only during final commit", async () => {
  const source = { ...canvas, editors: [{ ...canvas.editors[0], program: 0, trackType: "tab", cutPositionsWithCoords: [], optimalsByTime: {},
    notes: [{ id: -1, startTime: 0, length: 60, midiNum: 60, tab: [0, 0], optimals: [] }] }] };
  await render(); await act(async () => WorkerStub.current.onmessage?.({ data: { request: "attempt:1", canvas: source } }));
  const changed = structuredClone(source.editors[0]); changed.notes[0].midiNum = 74;
  await act(async () => mocks.render.mock.calls.at(-1)![0].streaming.onChange(source, { ...source, editors: [changed] }));
  const meta = { ...metadata, streamId: "retry", revision: 1 };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...meta, tracks: [] }))));
  await render(meta); await act(async () => WorkerStub.current.onmessage?.({ data: { request: "retry:1", canvas: source } }));
  expect(mocks.render.mock.calls.at(-1)![0].streaming.canvas.editors[0].notes[0].midiNum).toBe(74);
  await render(meta, true);
  expect(mocks.render.mock.calls.at(-1)![0].streaming.finishing).toBe(true);
});
