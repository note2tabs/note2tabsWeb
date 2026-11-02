import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import GteAddTrackOptions from "../../components/GteAddTrackOptions";

vi.mock("../../lib/i18n/react", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
let dom: JSDOM;
beforeAll(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterAll(() => { dom.window.close(); vi.unstubAllGlobals(); });

it.each([false, true])("groups every track type and dispatches the correct action (mobile=%s)", async mobile => {
  const host = document.createElement("div"), root = createRoot(host), onSelect = vi.fn();
  try {
    await act(async () => root.render(React.createElement(GteAddTrackOptions, {mobile, disabled: false, onSelect})));
    const groups = [...host.querySelectorAll('[role="group"]')];
    expect(groups.map(group => group.getAttribute("aria-label"))).toEqual(["Tabs", "Notation", "Drums", "Chords"]);
    expect(groups.map(group => [...group.querySelectorAll("button")].map(button => button.textContent))).toEqual([
      ["Guitar", "Bass"], ["Piano", "Strings", "Other instrument"], ["Drums"], ["Chords"],
    ]);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>("button")];
    expect(buttons.every(button => button.querySelector("svg"))).toBe(true);
    expect(groups[3].querySelector('[data-chord-diagram="E-major"]')).not.toBeNull();
    await act(async () => buttons.forEach(button => button.click()));
    expect(onSelect.mock.calls.map(call => call[0])).toEqual(["tab", "bass", "piano", "strings", "instrument", "drums", "chords"]);
    await act(async () => root.render(React.createElement(GteAddTrackOptions, {mobile, disabled: true, onSelect})));
    expect([...host.querySelectorAll<HTMLButtonElement>("button")].every(button => button.disabled)).toBe(true);
  } finally { await act(async () => root.unmount()); }
});
