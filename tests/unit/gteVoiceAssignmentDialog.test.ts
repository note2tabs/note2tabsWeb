import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { expect, it, vi } from "vitest";
import { MIDI_VOICE_COLORS } from "../../lib/gteMidiVoiceColors";
vi.mock("../../lib/i18n/react", () => ({ useLocale: () => ({ t: (text: string) => text }) }));
import Dialog from "../../components/GteVoiceAssignmentDialog";
it("provides an in-app confirmation with focus trapping, cancel, Escape and an explicit apply action", async () => {
  const dom = new JSDOM("<html><body><button id='previous'>Tools</button><div id='root'></div></body></html>");
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const cancel = vi.fn(), confirm = vi.fn(), root = createRoot(document.getElementById("root")!);
  const previous = document.getElementById("previous")!; previous.focus();
  try {
    await act(async () => root.render(React.createElement(Dialog, { selection: true, onCancel: cancel, onConfirm: confirm })));
    const dialog = document.querySelector('[role="dialog"]')!, buttons = dialog.querySelectorAll("button");
    expect(dialog.textContent).toContain("selected notes"); expect(document.activeElement).toBe(buttons[0]);
    const shiftTab = new dom.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    await act(async () => buttons[0].dispatchEvent(shiftTab)); expect(document.activeElement).toBe(buttons[1]);
    await act(async () => buttons[1].dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(buttons[0]);
    await act(async () => buttons[1].click()); expect(confirm).toHaveBeenCalledOnce();
    await act(async () => buttons[0].click()); expect(cancel).toHaveBeenCalledTimes(1);
    await act(async () => dialog.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(cancel).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount()); expect(document.activeElement).toBe(previous);
  } finally { dom.window.close(); vi.unstubAllGlobals(); }
});
it("keeps the two MIDI voices distinct in normal, selected and border colors", () => {
  for (const key of ["note", "selected", "border", "selectedBorder"] as const) expect(MIDI_VOICE_COLORS[1][key]).not.toBe(MIDI_VOICE_COLORS[2][key]);
});
