import React, { act, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { expect, it, vi } from "vitest";
import GteDrumScorePlayback from "../../components/GteDrumScorePlayback";

it("animates drums from the live clock across rows, seeks paused, and cleans up without score rerenders", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const callbacks = new Map<number, FrameRequestCallback>(); let id = 0, frame = 0;
  dom.window.requestAnimationFrame = callback => { callbacks.set(++id, callback); return id; };
  dom.window.cancelAnimationFrame = key => { callbacks.delete(key); };
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect = disconnect; });
  Object.defineProperty(dom.window.HTMLElement.prototype, "clientWidth", { get: () => 1000 });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const container = React.createRef<HTMLDivElement>(), commits = vi.fn(), getFrame = () => frame;
  const render = async (playing: boolean) => { await act(async () => root.render(React.createElement(Profiler, { id: "drums", onRender: commits },
    React.createElement("div", { ref: container }, ...[0,1].map(key => React.createElement("section", { key }, React.createElement("div", { "data-drum-score-playhead": true, style: { display: "none" } }))),
      React.createElement(GteDrumScorePlayback, { root: container, frame, playing, getFrame, framesPerBar: 480, barsPerRow: 4, rowCount: 2 }))))); };
  const tick = async () => { const pending = [...callbacks.values()]; callbacks.clear(); await act(async () => pending.forEach(callback => callback(0))); };
  try {
    await render(true);
    const lines = host.querySelectorAll<HTMLDivElement>("[data-drum-score-playhead]");
    expect(lines[0].style.display).toBe(""); expect(lines[1].style.display).toBe("none");
    const count = commits.mock.calls.length;
    frame = 960; await tick(); expect(lines[0].style.transform).toBe("translateX(calc(500px - 2.25rem))");
    frame = 1920; await tick(); expect(lines[0].style.display).toBe("none"); expect(lines[1].style.display).toBe("");
    frame = 2160; await tick(); expect(lines[1].style.transform).toBe("translateX(calc(125px - 0.5625rem))");
    expect(commits).toHaveBeenCalledTimes(count);
    frame = 120; await render(false); expect(callbacks.size).toBe(0); expect(lines[0].style.display).toBe(""); expect(lines[1].style.display).toBe("none");
    expect(lines[0].style.transform).toBe("translateX(calc(62.5px - 0.28125rem))");
  } finally { await act(async () => root.unmount()); host.remove(); dom.window.close(); vi.unstubAllGlobals(); }
  expect(callbacks.size).toBe(0); expect(disconnect).toHaveBeenCalled();
});
