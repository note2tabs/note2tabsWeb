import { describe, expect, it, vi } from "vitest";
import {
  getFullscreenElement,
  supportsElementFullscreen,
  toggleElementFullscreen,
} from "../../lib/fullscreen";

function createDocument(overrides: Record<string, unknown> = {}) {
  return {
    fullscreenElement: null,
    ...overrides,
  } as unknown as Document;
}

describe("fullscreen compatibility", () => {
  it("reports unsupported elements instead of calling a missing API", async () => {
    const element = {} as HTMLElement;
    const doc = createDocument();

    expect(supportsElementFullscreen(element)).toBe(false);
    await expect(toggleElementFullscreen(element, doc)).resolves.toBe("unsupported");
  });

  it("uses and awaits the standard fullscreen API", async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const element = { requestFullscreen } as unknown as HTMLElement;
    const doc = createDocument();

    expect(supportsElementFullscreen(element)).toBe(true);
    await expect(toggleElementFullscreen(element, doc)).resolves.toBe("entered");
    expect(requestFullscreen).toHaveBeenCalledOnce();
  });

  it("falls back to the WebKit API", async () => {
    const webkitRequestFullscreen = vi.fn().mockResolvedValue(undefined);
    const element = { webkitRequestFullscreen } as unknown as HTMLElement;
    const doc = createDocument();

    expect(supportsElementFullscreen(element)).toBe(true);
    await expect(toggleElementFullscreen(element, doc)).resolves.toBe("entered");
    expect(webkitRequestFullscreen).toHaveBeenCalledOnce();
  });

  it("exits an existing fullscreen session", async () => {
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    const activeElement = {} as Element;
    const doc = createDocument({ fullscreenElement: activeElement, exitFullscreen });

    expect(getFullscreenElement(doc)).toBe(activeElement);
    await expect(toggleElementFullscreen(null, doc)).resolves.toBe("exited");
    expect(exitFullscreen).toHaveBeenCalledOnce();
  });

  it("contains browser rejections instead of creating an unhandled exception", async () => {
    const element = {
      requestFullscreen: vi.fn().mockRejectedValue(new Error("Fullscreen denied")),
    } as unknown as HTMLElement;

    await expect(toggleElementFullscreen(element, createDocument())).resolves.toBe("failed");
  });
});
