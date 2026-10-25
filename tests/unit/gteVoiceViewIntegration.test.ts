import React, { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import type { EditorSnapshot } from "../../types/gte";
vi.mock("../../components/GteEngravedScore", () => ({ default: () => React.createElement("div", { "data-gte-sheet": "true" }) }));
vi.mock("../../components/GteNotationToolbar", () => ({ default: () => React.createElement("div") }));
vi.mock("../../lib/i18n/react", () => ({ useLocale: () => ({ t: (text: string) => text }) }));
import GteNotationWorkspace from "../../components/GteNotationWorkspace";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { assignVoices } from "../../lib/gteAssignVoices";
afterEach(() => vi.unstubAllGlobals());
it("assigns missing voices on Sheets entry, saves once, and does not rerun across view remounts or unrelated edits", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>");
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  let current: EditorSnapshot = { id: "piano", instrumentType: "notation", framesPerMessure: 480, totalFrames: 480, fps: 240,
    notes: [{ id: 1, midiNum: 48, startTime: 0, length: 480, tab: [0,0], optimals: [] },
      ...[64,65,67,69].map((pitch, i) => ({ id: i + 2, midiNum: pitch, startTime: i * 120, length: 120, tab: [0,0] as [number,number], optimals: [] }))],
    chords: [], cutPositionsWithCoords: [], optimalsByTime: {} };
  let setTrack: (track: EditorSnapshot) => void = () => {}, setVisible: (value: boolean) => void = () => {};
  const save = vi.fn();
  function Harness() {
    const [track, update] = useState(current), [visible, show] = useState(true);
    setTrack = update; setVisible = show; current = track;
    return visible ? React.createElement(GteNotationWorkspace, { editorId: "piano", snapshot: track, onSnapshotChange: (next: EditorSnapshot, options) => { save(next, options); update(next); } }) : null;
  }
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(React.createElement(StrictMode, null, React.createElement(Harness))));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1]).toEqual({ recordHistory: false, markDirty: true });
    expect(current.notes.map(note => note.notationVoice)).toEqual([2,1,1,1,1]);
    await act(async () => setVisible(false)); await act(async () => setVisible(true));
    await act(async () => setTrack({ ...current, name: "New title" }));
    expect(save).toHaveBeenCalledTimes(1);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
it("the actual Tools menu action applies only the current selection and uses existing save/history callbacks", () => {
  const source = readFileSync("pages/gte/[editor_id].tsx", "utf8"), ast = ts.createSourceFile("editor.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "renderTrackCleanupTool") expression = node.initializer!.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const track: EditorSnapshot = { id: "piano", framesPerMessure: 480, fps: 240, totalFrames: 480, notes: [
    { id: 1, midiNum: 48, startTime: 0, length: 480, tab: [0,0], optimals: [] },
    { id: 2, midiNum: 64, startTime: 0, length: 120, tab: [0,0], optimals: [], notationVoice: 1 },
    { id: 3, midiNum: 65, startTime: 120, length: 120, tab: [0,0], optimals: [], notationVoice: 1 },
  ], chords: [], cutPositionsWithCoords: [], optimalsByTime: {} };
  const changed = vi.fn(), saved = vi.fn(), confirm = vi.fn().mockReturnValue(true);
  const scope = { React, canvas: { editors: [track] }, canvasRef: { current: { editors: [track] } }, activeLaneId: track.id,
    isDrumLane: (lane: EditorSnapshot) => lane.trackType === "drums", practiceModeEnabled: false, laneSelectionById: { piano: { noteIds: [1], chordIds: [] } },
    assignVoices, handleLaneSnapshotChange: changed, queueDrumSave: saved, setVoiceAssignmentMessage: vi.fn(), t: (text: string) => text,
    handleCleanActiveTrack: vi.fn(), window: { confirm } };
  const script = ts.transpileModule(`(${expression})()`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const menu = vm.runInNewContext(script, scope), button = menu.props.children[0];
  expect(button.props.children).toBe("Auto Assign Voices");
  button.props.onClick();
  expect(changed).toHaveBeenCalledOnce(); expect(saved).toHaveBeenCalledWith(track.id, changed.mock.calls[0][1]);
  expect(changed.mock.calls[0][1].notes[0].notationVoice).toBe(2);
  expect(changed.mock.calls[0][1].notes.slice(1)).toEqual(track.notes.slice(1));
  track.notes[0].notationVoice = 1; confirm.mockReturnValue(false); changed.mockClear();
  vm.runInNewContext(script, scope).props.children[0].props.onClick();
  expect(confirm).toHaveBeenCalledOnce(); expect(changed).not.toHaveBeenCalled();
});
