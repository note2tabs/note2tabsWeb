import type { EditorSnapshot, Note } from "../types/gte";

/**
 * Treat at most a 1/64-note overlap as transcription boundary noise.
 */
export const transcriberOverlapToleranceFrames = (snapshot: EditorSnapshot) => {
  const framesPerMeasure = Number(snapshot.framesPerMessure) || 480;
  const beatsPerMeasure = Math.max(1, Number(snapshot.timeSignature) || 4);
  return Math.max(1, Math.round(framesPerMeasure / (beatsPerMeasure * 16)));
};

const noteString = (note: Note) => {
  const value = Number(note.tab?.[0]);
  return Number.isFinite(value) ? Math.trunc(value) : null;
};

/**
 * Shorten only tiny overlaps between consecutive imported notes assigned to
 * the same string. Simultaneous notes, notes on other strings, and chords are
 * deliberately untouched so intentional polyphony is preserved.
 */
export function shortenTinyImportedNoteOverlapsInSnapshot(
  snapshot: EditorSnapshot,
  toleranceFrames: number = transcriberOverlapToleranceFrames(snapshot)
): number {
  const trackType = snapshot.trackType ?? snapshot.editorType ?? snapshot.type;
  if (trackType === "drums" || trackType === "drum") return 0;

  const tolerance = Math.max(0, Math.round(toleranceFrames));
  if (tolerance === 0 || snapshot.notes.length < 2) return 0;

  const notesByString = new Map<number, Note[]>();
  snapshot.notes.forEach((note) => {
    const stringIndex = noteString(note);
    if (stringIndex === null) return;
    const notes = notesByString.get(stringIndex);
    if (notes) notes.push(note);
    else notesByString.set(stringIndex, [note]);
  });

  let shortened = 0;
  notesByString.forEach((notes) => {
    notes.sort((left, right) =>
      Math.round(left.startTime) - Math.round(right.startTime) || left.id - right.id
    );

    let groupStart = 0;
    while (groupStart < notes.length) {
      const onset = Math.round(notes[groupStart].startTime);
      let nextGroupStart = groupStart + 1;
      while (
        nextGroupStart < notes.length &&
        Math.round(notes[nextGroupStart].startTime) === onset
      ) {
        nextGroupStart += 1;
      }
      if (nextGroupStart >= notes.length) break;

      const nextOnset = Math.round(notes[nextGroupStart].startTime);
      for (let index = groupStart; index < nextGroupStart; index += 1) {
        const note = notes[index];
        const start = Math.round(note.startTime);
        const length = Math.max(1, Math.round(note.length));
        const overlap = start + length - nextOnset;
        if (overlap > 0 && overlap <= tolerance && nextOnset > start) {
          note.length = Math.max(1, nextOnset - start);
          shortened += 1;
        }
      }
      groupStart = nextGroupStart;
    }
  });

  return shortened;
}
