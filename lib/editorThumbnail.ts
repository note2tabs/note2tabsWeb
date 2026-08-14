import type { EditorListItem } from "../types/gte";

export function getEditorThumbnail(editor: EditorListItem) {
  const previewNotes = (editor.previewNotes || [])
    .filter(
      (note) =>
        Number.isFinite(note.startTime) &&
        Number.isInteger(note.string) &&
        note.string >= 0 &&
        note.string < 6 &&
        Number.isInteger(note.fret) &&
        note.fret >= 0
    )
    .slice(0, 36);
  const hasSavedContent =
    Math.max(0, editor.noteCount || 0) + Math.max(0, editor.chordCount || 0) > 0;

  return {
    previewNotes,
    label: previewNotes.length > 0 ? "TAB" : hasSavedContent ? "PREVIEW UNAVAILABLE" : "EMPTY TAB",
  } as const;
}
