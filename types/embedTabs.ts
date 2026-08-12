export type EmbeddedTabTrack = {
  id: string;
  name: string;
  kind: "tab" | "chords" | "drums";
  tabText: string;
  truncated: boolean;
};

export type EmbeddedTabPayload = {
  schemaVersion: 1;
  title: string;
  bpm: number | null;
  timeSignature: string;
  tracks: EmbeddedTabTrack[];
};

export type EmbedShareSummary = {
  id: string;
  tokenFingerprint: string;
  createdAt: string;
};

export type CreatedEmbedShare = {
  share: EmbedShareSummary;
  embedUrl: string;
  iframeHtml: string;
};
