import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { expect, it, vi } from "vitest";
import type { EditorSnapshot } from "../../types/gte";
import { scoreEvents } from "../../lib/gteNotation";
vi.mock("../../lib/i18n/react", () => ({ useLocale: () => ({ t: (value: string) => value }) }));
vi.mock("../../lib/gteSamplePlayback", () => ({ prepareTrackInstrument: vi.fn(), schedulePreparedTrackNote: vi.fn() }));
// Exercise the real workspace and toolbar. Only engraving is replaced by note
// targets, forwarding the actual score's stored source objects on pointerdown.
vi.mock("../../components/GteEngravedScore", () => ({ default: (props: any) => {
  const events = [...new Map(props.score.measures.flatMap((measure: any) => Object.values(measure.voices).flat(2).flatMap((token: any) => token.sources)).map((event: any) => [event.key, event])).values()] as any[];
  return React.createElement("div", { "data-gte-sheet": "true" }, events.map(event => React.createElement("button", { key: event.key, "data-note": event.key,
    onPointerDown: (e: any) => props.onSelect(event, e.shiftKey) }, event.key)));
} }));
import Workspace from "../../components/GteNotationWorkspace";

it("keeps actual Voice 2, mixed selections and repeated voice changes synchronized without disbanding chords", async () => {
  const dom = new JSDOM("<html><body><div id='root'></div></body></html>");
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  let snapshot: EditorSnapshot = { id: "voice-controls", instrumentType: "notation", fps: 240, framesPerMessure: 480, totalFrames: 480,
    notes: [{ id: 1, midiNum: 76, startTime: 0, length: 120, tab: [0,0], optimals: [], notationVoice: 1 }],
    chords: [{ id: 9, originalMidi: [48,55,60], currentTabs: [[0,0],[1,0],[2,0]], ogTabs: [], startTime: 0, length: 120, notationVoice: 2 }], cutPositionsWithCoords: [], optimalsByTime: {} };
  const saves = vi.fn(), root = createRoot(document.getElementById("root")!);
  function Harness() {
    const [track, update] = useState(snapshot); snapshot = track;
    return React.createElement(Workspace, { editorId: "voice-controls", snapshot: track, isActive: true, onSnapshotChange: (next: EditorSnapshot) => { saves(next); update(next); } });
  }
  const select = async (key: string, shiftKey = false) => { await act(async () => document.querySelector(`[data-note='${key}']`)!.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, shiftKey }))); };
  const button = (voice: number) => document.querySelector<HTMLButtonElement>(`[aria-label='Voice ${voice}']`)!;
  const pressed = () => [1,2].map(voice => button(voice).getAttribute("aria-pressed"));
  const change = async (voice: number) => {
    await act(async () => button(voice).dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true })));
    await act(async () => button(voice).click());
  };
  try {
    await act(async () => root.render(React.createElement(Harness)));
    await select("c:9:1"); expect(pressed()).toEqual(["false", "true"]);
    await change(1); expect(pressed()).toEqual(["true", "false"]);
    expect(scoreEvents(snapshot).filter(event => event.chordId === 9).map(event => event.voice)).toEqual([2,1,2]);
    expect(snapshot.notes).toHaveLength(1); expect(snapshot.chords).toHaveLength(1);
    await change(2); expect(pressed()).toEqual(["false", "true"]);
    await select("n:1", true); expect(pressed()).toEqual(["true", "true"]);
    await change(1); expect(pressed()).toEqual(["true", "false"]);
    expect(snapshot.notes[0].notationVoice).toBe(1);
    expect(snapshot.chords[0].notationMemberVoices).toEqual([2,1,2]);
    await change(2); expect(pressed()).toEqual(["false", "true"]);
    expect(snapshot.notes[0].notationVoice).toBe(2);
    expect(saves).toHaveBeenCalledTimes(4);
    expect(snapshot.chords[0].originalMidi).toEqual([48,55,60]);
    expect(snapshot.chords[0].length).toBe(120);
  } finally { await act(async () => root.unmount()); dom.window.close(); vi.unstubAllGlobals(); }
});
