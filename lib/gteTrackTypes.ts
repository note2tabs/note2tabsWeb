import type { EditorSnapshot, GteTrackType } from "../types/gte";

export const normalizeGteTrackType = (value: unknown): GteTrackType => {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "drum" || raw === "drums" || raw === "percussion") return "drums";
  if (raw === "bass" || raw === "bass-guitar" || raw === "bass guitar") return "bass";
  if (raw === "notation" || raw === "score" || raw === "sheet-music") return "notation";
  if (raw === "chord" || raw === "chords" || raw === "chordeditor" || raw === "chord-editor") {
    return "chords";
  }
  // "tab" and an absent type are legacy persisted guitar tracks. Named or
  // otherwise unknown pitched representations must not silently become tab.
  if (!raw || raw === "tab" || raw === "guitar" || raw === "guitar-tab") return "guitar";
  return "notation";
};

export const getSnapshotTrackType = (
  snapshot: Pick<EditorSnapshot, "editorType" | "trackType" | "type">
) => normalizeGteTrackType(snapshot.editorType ?? snapshot.trackType ?? snapshot.type);

export const getTrackTypeLabel = (type: GteTrackType) =>
  type === "guitar"
    ? "Guitar"
    : type === "bass"
      ? "Bass"
      : type === "drums"
        ? "Drums"
        : type === "notation"
          ? "Notation"
          : "Chords";

export const isTabTrackType = (value: unknown) => {
  const type = normalizeGteTrackType(value);
  return type === "guitar" || type === "bass";
};
