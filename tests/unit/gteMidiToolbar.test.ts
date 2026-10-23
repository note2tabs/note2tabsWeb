import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { JSDOM } from "jsdom";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import GteMidiToolbar from "../../components/GteMidiToolbar";

vi.mock("../../lib/i18n/react", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
let dom: JSDOM, width = 1200;
const observers = new Set<() => void>();
beforeAll(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document); vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { constructor(private callback: () => void) {} observe() { observers.add(this.callback); } disconnect() { observers.delete(this.callback); } });
  Object.defineProperty(dom.window.HTMLElement.prototype, "clientWidth", { configurable: true, get: () => width });
});
afterAll(() => { dom.window.close(); vi.unstubAllGlobals(); });
const props = () => ({ mode: "select" as const, disabled: false, onMode: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(), undoCount: 1, redoCount: 1,
  grid: 16, triplet: false, onGrid: vi.fn(), keyBase: 4, keyType: 1, onKeyChange: vi.fn(), snapToKey: true, onSnapToKey: vi.fn(), voice: 1 as const, onVoice: vi.fn(),
  hasSelection: true, onFitAll: vi.fn(), onFitSelection: vi.fn(), zoom: 240, row: 18, onZoom: vi.fn(), onRow: vi.fn(), onResetScale: vi.fn(), follow: false, onFollow: vi.fn(),
  audition: true, onAudition: vi.fn(), labels: true, onLabels: vi.fn(), onCenter: vi.fn() });

it("uses the requested control order, active modes, shared undo/redo and real grid/key/voice callbacks", async () => {
  width = 1200;
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host), p = props();
  const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.getAttribute("aria-label") === label || button.textContent?.startsWith(label))!;
  const change = async (label: string, value: string) => { const element = host.querySelector(`[aria-label="${label}"]`) as HTMLSelectElement; await act(async () => { element.value = value; element.dispatchEvent(new dom.window.Event("change", { bubbles: true })); }); };
  try {
    await act(async () => root.render(React.createElement(GteMidiToolbar, p)));
    const toolbar = host.querySelector('[role="toolbar"]')!;
    expect(toolbar.className).toContain("flex-nowrap"); expect(toolbar.className).not.toContain("flex-wrap");
    expect([...toolbar.querySelectorAll("button")].map(button => button.getAttribute("aria-label") ?? button.textContent)).toEqual(["Select", "Draw", "Undo", "Redo", "Snap to key", "Reset scale", "Fit all", "Focus view", "View⌄"]);
    expect(button("Select").getAttribute("aria-pressed")).toBe("true"); expect(button("Snap to key").getAttribute("aria-pressed")).toBe("true");
    for (const label of ["Select", "Draw", "Undo", "Redo", "Snap to key"]) expect(button(label).title).not.toBe("");
    await act(async () => { button("Draw").click(); button("Undo").click(); button("Redo").click(); button("Snap to key").click(); });
    expect(p.onMode).toHaveBeenCalledWith("draw"); expect(p.onUndo).toHaveBeenCalledOnce(); expect(p.onRedo).toHaveBeenCalledOnce(); expect(p.onSnapToKey).toHaveBeenCalledWith(false);
    await change("MIDI grid", "8T"); expect(p.onGrid).toHaveBeenCalledWith(8, true);
    await change("MIDI key", "2:0"); expect(p.onKeyChange).toHaveBeenCalledWith(2, 0);
    await change("MIDI voice", "2"); expect(p.onVoice).toHaveBeenCalledWith(2);
    expect(host.textContent).not.toContain("Snap strength");
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("keeps a single row at narrow widths and moves editing controls into the overflow", async () => {
  width = 500;
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host), p = props();
  try {
    await act(async () => root.render(React.createElement(GteMidiToolbar, p)));
    expect(host.querySelector('[aria-label="MIDI key"]')).toBeNull(); expect(host.querySelector('[aria-label="MIDI voice"]')).toBeNull();
    await act(async () => (host.querySelector('[aria-label="More MIDI controls"]') as HTMLButtonElement).click());
    expect(host.querySelector('[aria-label="MIDI key"]')).not.toBeNull(); expect(host.querySelector('[aria-label="MIDI voice"]')).not.toBeNull();
    await act(async () => { width = 300; observers.forEach(callback => callback()); });
    expect(host.querySelector('[aria-label="Undo"]')).not.toBeNull();
    await act(async () => (host.querySelector('[data-midi-menu="more"]') as HTMLButtonElement).click());
    expect(host.querySelector('[aria-label="Undo"]')).toBeNull();
    expect(host.querySelector('[aria-label="MIDI grid"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Select"]')).not.toBeNull();
    expect(host.querySelector('[data-midi-menu="view"]')).not.toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("provides percentage zoom, both fit actions, follow playback and display options in View", async () => {
  width = 1200;
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host), p = props();
  try {
    await act(async () => root.render(React.createElement(GteMidiToolbar, p)));
    await act(async () => (host.querySelector('[data-midi-menu="view"]') as HTMLButtonElement).click());
    expect([...host.querySelectorAll("output")].map(output => output.textContent)).toEqual(["100%", "100%"]);
    const horizontal = host.querySelector('[aria-label="MIDI zoom"]') as HTMLInputElement, vertical = host.querySelector('[aria-label="Pitch row height"]') as HTMLInputElement;
    await act(async () => { horizontal.value = "200"; Simulate.change(horizontal); vertical.value = "24"; Simulate.change(vertical); });
    expect(p.onZoom).toHaveBeenCalledWith(480); expect(p.onRow).toHaveBeenCalledWith(24);
    const view = horizontal.closest("div")!;
    await act(async () => [...view.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Reset scale")!.click());
    expect(p.onResetScale).toHaveBeenCalledOnce();
    const follow = [...view.querySelectorAll<HTMLLabelElement>("label")].find(label => label.textContent === "Follow playback")!.querySelector("input")!;
    await act(async () => { follow.checked = true; Simulate.change(follow); }); expect(p.onFollow).toHaveBeenCalledWith(true);
    expect(view.textContent).toContain("Note labels"); expect(view.textContent).toContain("Audition while dragging");
  } finally { await act(async () => root.unmount()); host.remove(); }
});
