// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { TranscriptionPreviewMetadata } from "../../lib/transcriptionPreviewProtocol";
const mocks = vi.hoisted(() => ({ render: vi.fn(), toggle: vi.fn(), pause: vi.fn(), seek: vi.fn() }));
vi.mock("../../lib/gteStreamingPreload", () => ({preloadStreamingEditor:vi.fn(async()=>{})}));
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
// What the backend currently serves; the component polls it directly.
let served: any;
const serve = (value: any) => { served = value; vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...served, tracks: [] })))); };
const poll = async () => act(async () => { await vi.advanceTimersByTimeAsync(2600); });
const metadata: TranscriptionPreviewMetadata = { version: 1, streamId: "attempt", revision: 1, processedSeconds: 1, durationSeconds: 10, complete: false };
const canvas = { id: "preview", editors: [{ id: "lane", name: "Piano", instrumentType: "notation", notes: [{ id: -1, startTime: 0, length: 60, midiNum: 60, tab: [0, 0], optimals: [] }], chords: [], fps: 240, totalFrames: 480 }] };
beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  vi.clearAllMocks(); vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("Worker", WorkerStub);
  serve(metadata);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const render = async (value: TranscriptionPreviewMetadata | null = metadata, finishing = false, extra: any = {}) => act(async () => root.render(React.createElement(Preview, { jobId: "job", name: "Song", metadata: value, finishing, ...extra })));
it("waits quietly, polling only the preview artifact, before the first note and uses a simple progress banner", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
  await render(null);
  expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).endsWith("/preview"))).toBe(true);
  expect(mocks.render).not.toHaveBeenCalled();
  expect(host.querySelector(".job-progress-card")).not.toBeNull();
  expect(host.querySelector(".gte-editor-loading")).toBeNull();
});
it("mounts the real editor workspace and does not introduce separate preview transport or tabs", async () => {
  await render();
  await act(async () => WorkerStub.current.onmessage?.({ data: { request: "attempt:1", canvas } }));
  await act(async () => { await vi.advanceTimersByTimeAsync(9500); });
  expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ editorId: "stream-job", isGuestMode: false, streaming: expect.objectContaining({ finishing: false }) }));
  expect(host.querySelector("select")).toBeNull(); expect(host.querySelector("footer")).toBeNull();
  await render({ ...metadata }); expect(fetch).toHaveBeenCalled();
});
it("discards stale worker results and keeps the preview visible during final import", async () => {
  await render(); serve({ ...metadata, revision: 2 }); await poll(); await render({ ...metadata, revision: 2 }, true);
  await act(async () => WorkerStub.current.onmessage?.({ data: { request: "attempt:1", canvas } }));
  await act(async () => { await vi.advanceTimersByTimeAsync(9500); });
  // The editor is already open (artifact exists) but the stale result put no notes in it.
  expect(mocks.render.mock.calls.at(-1)![0].streaming.canvas.editors[0].notes).toHaveLength(0);
  await act(async () => WorkerStub.current.onmessage?.({ data: { request: "attempt:2", canvas } }));
  await act(async () => { await vi.advanceTimersByTimeAsync(9500); });
  expect(mocks.render).toHaveBeenCalled();
  expect(mocks.render.mock.calls.at(-1)![0].streaming.finishing).toBe(false);
  expect(host.querySelector('button[disabled]')).toBeNull();
});
it("keeps user changes and undo/redo separate from arriving notes, with no save requests", async () => {
  const source = { ...canvas, editors: [{ ...canvas.editors[0], program: 0, trackType: "tab", cutPositionsWithCoords: [], optimalsByTime: {},
    notes: [{ id: -1, startTime: 0, length: 60, midiNum: 60, tab: [0, 0], optimals: [] }] }] };
  await render();
  await act(async () => WorkerStub.current.onmessage?.({ data: { request: "attempt:1", canvas: source } }));
  await act(async () => { await vi.advanceTimersByTimeAsync(9500); });
  const changed = structuredClone(source.editors[0]); changed.notes[0].midiNum = 72;
  await act(async () => mocks.render.mock.calls.at(-1)![0].streaming.onChange(source, { ...source, editors: [changed] }));
  expect(JSON.parse(window.localStorage.getItem("note2tabs:stream-edits:v1:job")!).tracks[0].events).toHaveLength(1);
  const incoming = structuredClone(source); incoming.editors[0].notes.push({ ...incoming.editors[0].notes[0], id: -99, startTime: 600, midiNum: 65 });
  serve({ ...metadata, revision: 2 }); await poll();
  await render({ ...metadata, revision: 2 });
  await act(async () => WorkerStub.current.onmessage?.({ data: { request: "attempt:2", canvas: incoming } }));
  await act(async () => { await vi.advanceTimersByTimeAsync(9500); });
  let props = mocks.render.mock.calls.at(-1)![0];
  expect(props.streaming.canvas.editors[0].notes.map((note: any) => note.midiNum)).toEqual([72, 65]);
  await act(async () => props.streaming.undo()); props = mocks.render.mock.calls.at(-1)![0];
  expect(props.streaming.canvas.editors[0].notes.map((note: any) => note.midiNum)).toEqual([60, 65]);
  await act(async () => props.streaming.redo());
  expect(mocks.render.mock.calls.at(-1)![0].streaming.canvas.editors[0].notes.map((note: any) => note.midiNum)).toEqual([72, 65]);
  expect(vi.mocked(fetch).mock.calls.every(call => !call[1]?.method || call[1].method === "GET")).toBe(true);
});
it("restores local edits after a retry and keeps editing enabled while the job finishes", async () => {
  const source = { ...canvas, editors: [{ ...canvas.editors[0], program: 0, trackType: "tab", cutPositionsWithCoords: [], optimalsByTime: {},
    notes: [{ id: -1, startTime: 0, length: 60, midiNum: 60, tab: [0, 0], optimals: [] }] }] };
  await render(); await act(async () => WorkerStub.current.onmessage?.({ data: { request: "attempt:1", canvas: source } }));
  await act(async () => { await vi.advanceTimersByTimeAsync(9500); });
  const changed = structuredClone(source.editors[0]); changed.notes[0].midiNum = 74;
  await act(async () => mocks.render.mock.calls.at(-1)![0].streaming.onChange(source, { ...source, editors: [changed] }));
  const meta = { ...metadata, streamId: "retry", revision: 1 };
  serve(meta);
  await render(meta); await poll(); await act(async () => WorkerStub.current.onmessage?.({ data: { request: "retry:1", canvas: source } }));
  await act(async () => { await vi.advanceTimersByTimeAsync(9500); });
  expect(mocks.render.mock.calls.at(-1)![0].streaming.canvas.editors[0].notes[0].midiNum).toBe(74);
  await render(meta, true);
  expect(mocks.render.mock.calls.at(-1)![0].streaming.finishing).toBe(false);
});

it("finishes in the same mounted editor, rejects stale final processing, and keeps edits made while it runs", async () => {
  const source = { ...canvas, secondsPerBar: 2, editors: [{ ...canvas.editors[0], program: 0, trackType: "tab", cutPositionsWithCoords: [], optimalsByTime: {},
    notes: [{ id: -1, startTime: 0, length: 60, midiNum: 60, tab: [0, 0], optimals: [] }] }] };
  const finalSource = { tracks: [], bpm: 120, beatsPerBar: 4 };
  const save = vi.fn(async () => "saved-editor");
  await render(); await act(async () => WorkerStub.current.onmessage?.({ data: { request: "attempt:1", canvas: source } }));
  await act(async () => { await vi.advanceTimersByTimeAsync(9500); });
  await render(metadata, true, { finalSource, onSave: save });
  await act(async () => WorkerStub.current.onmessage?.({ data: { request: "attempt:final", canvas: source } }));
  await act(async () => { await vi.advanceTimersByTimeAsync(9500); });
  const finishing = WorkerStub.current.postMessage.mock.calls.findLast(([item]) => item.type === "complete")![0];
  const changed = structuredClone(source); changed.editors[0].notes[0].midiNum = 72;
  await act(async () => mocks.render.mock.calls.at(-1)![0].streaming.onChange(source, changed));
  await act(async () => WorkerStub.current.onmessage?.({ data: { type: "complete", revision: finishing.revision, canvas: source } }));
  expect(save).not.toHaveBeenCalled();
  const latest = WorkerStub.current.postMessage.mock.calls.findLast(([item]) => item.type === "complete")![0];
  expect(latest.canvas.editors[0].notes[0].midiNum).toBe(72);
  await act(async () => WorkerStub.current.onmessage?.({ data: { type: "complete", revision: latest.revision, canvas: latest.canvas } }));
  expect(save).toHaveBeenCalledTimes(1);
  const props = mocks.render.mock.calls.at(-1)![0];
  expect(props.editorId).toBe("saved-editor"); expect(props.streaming).toBeUndefined();
  expect(props.hydratedCanvas.editors[0].notes[0].midiNum).toBe(72);
});

it("holds progress behind queued notes even when model progress is ahead", async () => {
 const source = { ...canvas, editors: [{ ...canvas.editors[0], notes: [0,240,480,720].map((startTime,index) => ({ ...canvas.editors[0].notes[0], id:-index-1, startTime })) }] };
 await render({ ...metadata, processedSeconds:8, settledSeconds:8 });
 await act(async () => WorkerStub.current.onmessage?.({ data: { request:"attempt:1", canvas:source, throughSeconds:8 } }));
 expect(mocks.render.mock.calls.at(-1)![0].streaming.progress).toBe(0);
 await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
 const halfway = mocks.render.mock.calls.at(-1)![0];
 expect(halfway.streaming.progress).toBeGreaterThan(0);
 expect(halfway.streaming.progress).toBeLessThan(80);
 await act(async () => { await vi.advanceTimersByTimeAsync(6500); });
 expect(mocks.render.mock.calls.at(-1)![0].streaming.progress).toBe(80);
});

it("opens the editor with unsettled real previews but keeps them out of the editable score",async()=>{
 await render();
 const empty={...canvas,editors:[{...canvas.editors[0],notes:[]}]};
 const ghost={key:"unsettled:0",phase:"preview",start:0,length:60,midi:60,tab:[0,0]};
 await act(async()=>WorkerStub.current.onmessage?.({data:{request:"attempt:1",canvas:empty,provisionalGhosts:{lane:[ghost]},throughSeconds:0}}));
 let props=mocks.render.mock.calls.at(-1)![0];
 expect(props.streaming.canvas.editors[0].notes).toHaveLength(0);
 expect(props.streaming.ghosts.lane.filter((note: any) => note.phase === "preview")).toEqual([ghost]);
 await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
 props=mocks.render.mock.calls.at(-1)![0];expect(props.streaming.canvas.editors[0].notes).toHaveLength(0);
 expect(props.streaming.ghosts.lane.filter((note: any) => note.phase === "preview")).toEqual([ghost]);
});

it("opens the editor as soon as the first preview artifact exists, before any note", async () => {
  await render();
  const props = mocks.render.mock.calls.at(-1)![0];
  expect(props.streaming.canvas.editors[0].notes).toHaveLength(0);
  expect(props.streaming.stage).toMatch(/Listening/);
});
