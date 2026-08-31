import type { TranscriptionModelChoice } from "./transcriptionModels";

export const RETENTION_RESEARCH_VERSION = "retention_v1";

export type TranscriptionResearchInput = {
  mode: "FILE" | "YOUTUBE";
  transcriptionModel: TranscriptionModelChoice;
  separateGuitar: boolean | null;
  multipleGuitars: boolean | null;
  durationSec?: number | null;
  fileSizeBytes?: number | null;
  appendingToExistingEditor?: boolean;
};

export function buildTranscriptionResearchProperties(input: TranscriptionResearchInput) {
  return {
    research_version: RETENTION_RESEARCH_VERSION,
    mode: input.mode,
    input_source: input.mode === "YOUTUBE" ? "youtube" : "local_file",
    transcriptionModel: input.transcriptionModel,
    separate_guitar: Boolean(input.separateGuitar),
    multiple_guitars: Boolean(input.multipleGuitars),
    duration_sec:
      typeof input.durationSec === "number" && Number.isFinite(input.durationSec)
        ? Math.max(0, input.durationSec)
        : undefined,
    durationSec:
      typeof input.durationSec === "number" && Number.isFinite(input.durationSec)
        ? Math.max(0, input.durationSec)
        : undefined,
    file_size_bytes:
      typeof input.fileSizeBytes === "number" && Number.isFinite(input.fileSizeBytes)
        ? Math.max(0, Math.round(input.fileSizeBytes))
        : undefined,
    appending_to_existing_editor: Boolean(input.appendingToExistingEditor),
  } as const;
}
