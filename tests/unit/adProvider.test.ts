import { afterEach, describe, expect, it, vi } from "vitest";
import { getAdProvider } from "../../lib/ads/provider";
import type { AdProviderEvent } from "../../lib/ads/types";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("advertising provider bridge", () => {
  it("supports a credential-free mock lifecycle for review builds", async () => {
    vi.useFakeTimers();
    const replaceChildren = vi.fn();
    vi.stubGlobal("document", {
      createElement: () => ({ className: "", textContent: "" }),
    });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
    });
    const events: AdProviderEvent[] = [];
    const provider = getAdProvider("mock");
    const handle = await provider.mount(
      { replaceChildren } as unknown as HTMLElement,
      {
        slotId: "test-slot",
        placement: "editor",
        unitId: "dev/editor",
        sizes: [[728, 90]],
        demandSources: ["mock"],
        limitedAds: false,
      },
      (event) => events.push(event)
    );

    expect(events.map((event) => event.type)).toEqual(["fill", "impression"]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.map((event) => event.type)).toEqual(["fill", "impression", "viewable"]);
    await handle.destroy();
    expect(replaceChildren).toHaveBeenLastCalledWith();
  });
});
