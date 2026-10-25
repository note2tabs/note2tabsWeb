import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { expect, it, vi } from "vitest";
import * as geometry from "../../lib/gtePracticePianoRoll";

it("keeps the canvas visible through pause, resize, seek and playback updates", () => {
  const image = createCanvas(900, 400), raw = image.getContext("2d");
  const paint = vi.fn((x: number, y: number, w: number, h: number) => raw.fillRect(x, y, w, h));
  const rounded = vi.fn((x: number, y: number, w: number, h: number, r: number) => raw.roundRect(x, y, w, h, r));
  const context = new Proxy(raw, {
    get(target, key) {
      if (key === "fillRect") return paint;
      if (key === "roundRect") return rounded;
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, key, value) { return Reflect.set(target, key, value); },
  });
  let bitmapResets = 0;
  const surface = { getContext: () => context, style: {}, set width(value: number) { bitmapResets++; image.width = value; }, set height(value: number) { bitmapResets++; image.height = value; } };
  const host = { clientWidth: 900, clientHeight: 400, scrollWidth: 900, scrollLeft: 0, style: {} as Record<string, string>, getBoundingClientRect: () => ({ top: 180 }) };
  const browser = { devicePixelRatio: 1, innerHeight: undefined as number | undefined };
  const hooks: any[] = [];
  const pending: Array<() => void> = [];
  let cursor = 0, observerCallback = () => {}, id = 0, frame = 0;
  const frames = new Map<number, () => void>();
  const same = (a: unknown[], b: unknown[]) => a?.length === b.length && a.every((value, index) => value === b[index]);
  const react = {
    Fragment: jsx.Fragment,
    useState(initial: unknown) { cursor++; return [initial, () => {}]; },
    useRef(initial: unknown) { const index = cursor++; return hooks[index] ??= { current: index === 0 ? surface : index === 1 ? host : initial }; },
    useMemo(factory: () => unknown, deps: unknown[]) {
      const index = cursor++;
      if (!hooks[index] || !same(hooks[index].deps, deps)) hooks[index] = { deps, value: factory() };
      return hooks[index].value;
    },
    useEffect(effect: () => (() => void) | void, deps: unknown[]) {
      const index = cursor++;
      if (!hooks[index] || !same(hooks[index].deps, deps)) {
        hooks[index]?.cleanup?.();
        hooks[index] = { deps };
        pending.push(() => { hooks[index].cleanup = effect(); });
      }
    },
  };
  const module = { exports: {} as any };
  const source = ts.transpileModule(readFileSync("components/GtePracticePianoRoll.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, window: browser,
    requestAnimationFrame: (callback: () => void) => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: (key: number) => frames.delete(key),
    ResizeObserver: class { constructor(callback: () => void) { observerCallback = callback; } observe() {} disconnect() {} },
    require: (name: string) => name === "react" ? react : name === "react/jsx-runtime" ? jsx : name.includes("gtePracticePianoRoll") ? geometry : { scoreEvents: () => [
      { midi: 60, start: 0, length: 120, voice: 1 }, { midi: 60, start: 0, length: 120, voice: 2 },
      ...Array.from({ length: 384 }, (_, index) => ({ midi: 48 + index % 24, start: 120 + Math.floor(index / 12) * 30,
        length: index % 7 === 0 ? 2 : 45, voice: index % 2 ? 2 : 1 })),
    ] },
  });
  const snapshot = { fps: 240 };
  let view: any;
  const render = (playing: boolean) => {
    cursor = 0;
    view = module.exports.default({ snapshot, isActive: false, globalPlaybackFrame: frame, globalPlaybackIsPlaying: playing, getGlobalPlaybackFrame: () => frame });
    pending.splice(0).forEach(effect => effect());
  };
  const tick = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); };
  render(false); tick();
  const elements = (node: any): any[] => Array.isArray(node) ? node.flatMap(elements) : node?.props ? [node, ...elements(node.props.children)] : [];
  const canvasElement = elements(view).find(node => node.type === "canvas");
  const viewportElement = elements(view).find(node => node.type === "div" && node.props.style?.contain === "layout size");
  expect(canvasElement.props.className).toContain("absolute");
  expect(viewportElement.props.className).toContain("overflow-y-hidden");
  expect(viewportElement.props.style.contain).toBe("layout size");
  expect(elements(view).some(node => node.props["data-gte-practice-transport-slot"] === "true")).toBe(false); // Transport remains screen-fixed, including on non-editing-active tracks.
  if (process.env.GTE_PRACTICE_RENDER_PATH) writeFileSync(process.env.GTE_PRACTICE_RENDER_PATH, image.toBuffer("image/png"));
  expect(paint).toHaveBeenCalled();
  expect(rounded.mock.calls.length).toBeGreaterThanOrEqual(384);
  expect(rounded.mock.calls[0][0]).not.toBe(rounded.mock.calls[1][0]); // Both voices stay visible on the same pitch.
  expect(rounded.mock.calls[0][2]).toBeLessThan(26); // No oversized note/key columns.
  expect(rounded.mock.calls.every(call => call[3] >= 6)).toBe(true); // Even very short hits stay visible.
  expect(bitmapResets).toBe(2);
  paint.mockClear(); observerCallback(); tick();
  expect(bitmapResets).toBe(2);
  frame = 30; render(true); tick();
  expect(paint).toHaveBeenCalled();
  expect(bitmapResets).toBe(2);
  render(false); paint.mockClear(); tick();
  expect(paint).not.toHaveBeenCalled(); // Preserve the paused bitmap.
  host.clientHeight = 420; observerCallback();
  expect(paint).toHaveBeenCalled(); // Resize redraws synchronously, even while paused.
  const resetCount = bitmapResets;
  paint.mockClear(); observerCallback(); observerCallback();
  expect(bitmapResets).toBe(resetCount); // Repeated observer notifications cannot blank the bitmap.
  expect(paint).not.toHaveBeenCalled();
  tick();
  host.clientHeight = 0; observerCallback();
  expect(bitmapResets).toBe(resetCount); // Transient hidden layout preserves the last painted frame.
  host.clientHeight = 420;
  paint.mockClear(); frame = 90; render(false); tick();
  expect(paint).toHaveBeenCalled(); // Seeking while paused redraws immediately.
  browser.innerHeight = 900;
  observerCallback();
  expect(host.style.height).toBe("608px"); // 900 - roll top (180) - compact seek/transport reserve (112).
  for (const hook of hooks) hook?.cleanup?.();
  expect(frames.size).toBe(0);
});
