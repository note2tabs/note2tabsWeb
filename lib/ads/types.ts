export type AdPlacement = "transcription-loading" | "editor" | "editor-practice";

export type AdProviderEvent =
  | { type: "fill"; demandSource?: string }
  | { type: "no-fill"; demandSource?: string }
  | { type: "impression"; demandSource?: string }
  | { type: "viewable"; demandSource?: string }
  | { type: "revenue"; revenueMicros: number; currency: string; demandSource?: string }
  | { type: "error"; code?: string };

export type AdSlotRequest = {
  slotId: string;
  placement: AdPlacement;
  unitId: string;
  sizes: ReadonlyArray<readonly [number, number]>;
  demandSources: readonly string[];
  limitedAds: boolean;
};

export type AdProviderHandle = {
  refresh?: () => void | Promise<void>;
  destroy: () => void | Promise<void>;
};

export type AdProvider = {
  name: string;
  load: () => void | Promise<void>;
  mount: (
    element: HTMLElement,
    request: AdSlotRequest,
    emit: (event: AdProviderEvent) => void
  ) => AdProviderHandle | Promise<AdProviderHandle>;
};
