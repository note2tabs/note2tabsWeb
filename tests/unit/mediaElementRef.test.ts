import { describe, expect, it, vi } from "vitest";
import { createMediaElementRef } from "../../lib/mediaElementRef";

function video() {
  const operations: string[] = [];
  const element = {
    pause: vi.fn(() => operations.push("pause")),
    removeAttribute: vi.fn((attribute: string) => operations.push(`remove:${attribute}`)),
    load: vi.fn(() => operations.push("load")),
  };
  return { element: element as unknown as HTMLVideoElement, operations };
}

describe("tutorial media lifecycle", () => {
  it("stops and resets playback before releasing a closing tutorial's video", () => {
    const ref = createMediaElementRef<HTMLVideoElement>();
    const first = video();
    ref(first.element);
    expect(first.operations).toEqual([]);
    ref(null);
    expect(first.operations).toEqual(["pause", "remove:src", "load"]);
    ref(null);
    expect(first.element.pause).toHaveBeenCalledOnce();
  });

  it("releases only the old video when changing cards or reopening the tutorial", () => {
    const ref = createMediaElementRef<HTMLVideoElement>();
    const first = video();
    const second = video();
    ref(first.element);
    ref(first.element);
    expect(first.operations).toEqual([]);
    ref(second.element);
    expect(first.operations).toEqual(["pause", "remove:src", "load"]);
    expect(second.operations).toEqual([]);
    ref(null);
    expect(second.operations).toEqual(["pause", "remove:src", "load"]);
  });
});
