import { track } from "../analyticsV2";

export type TransferKind = "export" | "import";
export function beginTransfer(kind: TransferKind, format: string, surface: string, project?: string) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const safeFormat = ["mid", "midi", "musicxml", "xml", "mxl", "json", "txt", "gp", "gp3", "gp4", "gp5", "gpx", "gtp"].includes(format.toLowerCase()) ? format.toLowerCase() : "unknown";
  const props = { transfer_id: id, format: safeFormat, surface, ...(project ? { editor_id: project } : {}), transfer_schema_version: 1 };
  const emit = (name: string, extra: Record<string, unknown> = {}) => {
    // Telemetry must never turn a successful transfer into a product failure.
    try { void track(name, { ...props, ...extra }).catch(() => {}); } catch { /* unavailable analytics */ }
  };
  emit(`gte_${kind}_requested`);
  let terminal = false;
  return {
    prepared() { if (!terminal) emit(`gte_${kind}_prepared`); },
    completed(editorId = project) {
      if (terminal) return;
      terminal = true;
      emit(kind === "export" ? "gte_export_download_initiated" : "gte_file_import_completed",
        editorId ? { editor_id: editorId } : {});
    },
    failed() {
      if (terminal) return;
      terminal = true;
      // No raw parser errors, filenames, URLs, song names, or file contents.
      emit(kind === "export" ? "gte_export_failed" : "gte_file_import_failed");
    },
    cancelled() { if (!terminal) { terminal = true; emit(`gte_${kind}_cancelled`); } },
  };
}
