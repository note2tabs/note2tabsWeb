import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { expect, it, vi } from "vitest";
import { selectPortalTargetWithin } from "../../lib/selectPortalTarget";
import Note2TabsSelect from "../../components/Note2TabsSelect";
import GteTrackSoundSelect from "../../components/GteTrackSoundSelect";
import { getTrackInstrumentOptions } from "../../lib/gteInstrumentManifest";
vi.mock("../../lib/i18n/react", () => ({ useLocale: () => ({ t: (key: string) => key }) }));

it("groups sampled sounds and supports portalled selection, keyboard navigation and outside dismissal", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document); vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host), change = vi.fn();
  try {
    await act(async () => root.render(React.createElement(GteTrackSoundSelect, { value: "upright_piano", options: getTrackInstrumentOptions(), onChange: change })));
    const details = host.querySelector("details")!;
    await act(async () => { details.open = true; details.dispatchEvent(new dom.window.Event("toggle")); });
    const menu = document.querySelector('[role="listbox"]')!;
    expect(host.contains(menu)).toBe(false);
    expect([...menu.querySelectorAll('[role="presentation"]')].map(node => node.textContent)).toEqual(["Guitar", "Bass", "Piano", "Synth"]);
    const options = [...menu.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    const selected = menu.querySelector<HTMLButtonElement>('[aria-selected="true"]')!;
    expect(selected.textContent).toContain("Upright Piano");
    selected.focus();
    await act(async () => selected.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(document.activeElement?.textContent).toContain("Grand Piano");
    await act(async () => (document.activeElement as HTMLButtonElement).click());
    expect(change).toHaveBeenCalledWith("grand_piano"); expect(details.open).toBe(false);
    await act(async () => { details.open = true; details.dispatchEvent(new dom.window.Event("toggle")); });
    await act(async () => document.body.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true })));
    expect(details.open).toBe(false);
    await act(async () => root.render(React.createElement(Note2TabsSelect, { label: "Instrument type", value: "bass-tab", options: [{value:"guitar-tab",label:"Guitar tab",disabled:true},{value:"bass-tab",label:"Bass tab"}], onChange: change })));
    expect(host.querySelector<HTMLButtonElement>('[role="option"]')!.disabled).toBe(true);
  } finally { await act(async () => root.unmount()); host.remove(); dom.window.close(); vi.unstubAllGlobals(); }
});

it("keeps the track card open through mouse and touch selection in its portalled sound menu", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document); vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), change = vi.fn();
  function Card() {
    const [open, setOpen] = React.useState(true);
    React.useEffect(() => {
      const outside = (e: Event) => { if (!selectPortalTargetWithin(e.target as Element, "[data-track-menu='true']")) setOpen(false); };
      window.addEventListener("mousedown", outside, true); window.addEventListener("touchstart", outside, true);
      return () => { window.removeEventListener("mousedown", outside, true); window.removeEventListener("touchstart", outside, true); };
    }, []);
    return open ? React.createElement("div", {"data-track-menu":"true"}, React.createElement(GteTrackSoundSelect, {value:"upright_piano",options:getTrackInstrumentOptions(),onChange:change})) : null;
  }
  try {
    await act(async () => root.render(React.createElement(Card)));
    for (const start of ["mousedown", "touchstart"]) {
      const details = host.querySelector("details")!;
      await act(async () => { details.open = true; details.dispatchEvent(new dom.window.Event("toggle")); });
      const option = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(el => el.textContent?.includes("Grand Piano"))!;
      await act(async () => option.dispatchEvent(new dom.window.Event(start, {bubbles:true})));
      expect(host.querySelector("details")).not.toBeNull();
      await act(async () => option.dispatchEvent(new dom.window.MouseEvent("click", {bubbles:true})));
    }
    expect(change).toHaveBeenCalledTimes(2); expect(change).toHaveBeenLastCalledWith("grand_piano");
    await act(async () => document.body.dispatchEvent(new dom.window.MouseEvent("mousedown", {bubbles:true})));
    expect(host.querySelector("details")).toBeNull();
  } finally { await act(async () => root.unmount()); dom.window.close(); vi.unstubAllGlobals(); }
});
