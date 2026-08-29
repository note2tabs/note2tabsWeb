import type { AdProvider, AdProviderEvent, AdProviderHandle, AdSlotRequest } from "./types";

type AdBridge = {
  load: () => void | Promise<void>;
  mount: (
    element: HTMLElement,
    request: AdSlotRequest,
    emit: (event: AdProviderEvent) => void
  ) => AdProviderHandle | Promise<AdProviderHandle>;
};

declare global {
  interface Window {
    note2tabsAdBridge?: AdBridge;
  }
}

const bridgeLoadPromises = new WeakMap<object, Promise<void>>();

async function loadBridgeOnce(bridge: AdBridge) {
  const existing = bridgeLoadPromises.get(bridge);
  if (existing) return existing;
  const pending = Promise.resolve(bridge.load()).catch((error) => {
    bridgeLoadPromises.delete(bridge);
    throw error;
  });
  bridgeLoadPromises.set(bridge, pending);
  return pending;
}

const unavailableProvider: AdProvider = {
  name: "none",
  load: () => {},
  mount: (_element, _request, emit) => {
    emit({ type: "error", code: "provider_unavailable" });
    return { destroy: () => {} };
  },
};

const bridgeProvider: AdProvider = {
  name: "bridge",
  load: async () => {
    if (!window.note2tabsAdBridge) throw new Error("ad_bridge_unavailable");
    await loadBridgeOnce(window.note2tabsAdBridge);
  },
  mount: async (element, request, emit) => {
    if (!window.note2tabsAdBridge) throw new Error("ad_bridge_unavailable");
    return window.note2tabsAdBridge.mount(element, request, emit);
  },
};

const mockProvider: AdProvider = {
  name: "mock",
  load: () => {},
  mount: (element, request, emit) => {
    const creative = document.createElement("span");
    creative.className = "ad-slot__mock-creative";
    creative.textContent = `Simulated demand · ${request.placement}`;
    element.replaceChildren(creative);
    emit({ type: "fill", demandSource: "mock" });
    emit({ type: "impression", demandSource: "mock" });
    const viewableTimer = window.setTimeout(
      () => emit({ type: "viewable", demandSource: "mock" }),
      1000
    );
    return {
      refresh: () => {
        emit({ type: "fill", demandSource: "mock" });
        emit({ type: "impression", demandSource: "mock" });
      },
      destroy: () => {
        window.clearTimeout(viewableTimer);
        element.replaceChildren();
      },
    };
  },
};

export function getAdProvider(name: string): AdProvider {
  if (name === "bridge") return bridgeProvider;
  if (name === "mock") return mockProvider;
  return unavailableProvider;
}
