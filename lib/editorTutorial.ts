export type EditorTutorialCard = {
  id: string;
  eyebrow: string;
  title: string;
  mediaSrc: string;
  mediaAlt: string;
  mediaType?: "image" | "video";
  mediaFit?: "cover" | "contain";
  text: string;
  mediaPosition?: string;
};

/**
 * Edit, reorder, add, or remove cards here. The tutorial UI and progress dots
 * are generated directly from this array.
 */
export const EDITOR_TUTORIAL_CARDS: EditorTutorialCard[] = [
  {
    id: "canvas",
    eyebrow: "The workspace",
    title: "Shape the tab on the canvas",
    mediaSrc: "/videos/tutorials/tutvid01.mp4",
    mediaAlt: "Adding and editing a note on the Note2Tabs canvas",
    mediaType: "video",
    mediaFit: "cover",
    text: "Click on the tab to move the cursor and use {numbers} to add a note. Select the note with {mouse} or {enter} and press {plus}/{minus} to change the fret. Use the mouse or {arrows} to move the cursor. Use {backspace} or {delete} to delete a note.",
  },
  {
    id: "tracks",
    eyebrow: "Tracks",
    title: "Keep every part organized",
    mediaSrc: "/images/editor-previews/collage.webp",
    mediaAlt: "Several Note2Tabs editor views arranged together",
    text: "Use the track menu to switch parts. The pencil opens instrument, tuning, playback, offset, and removal settings.",
    mediaPosition: "center 42%",
  },
  {
    id: "playback",
    eyebrow: "Listen and practice",
    title: "Hear changes as you work",
    mediaSrc: "/images/editor-previews/collage-training.webp",
    mediaAlt: "Note2Tabs playback and practice tools",
    text: "Play from anywhere, loop a section, add a metronome, slow the song down, or move into Practice mode for a focused view.",
    mediaPosition: "center 48%",
  },
  {
    id: "tools",
    eyebrow: "Editing tools",
    title: "Let the editor handle the repetitive work",
    mediaSrc: "/images/doodles/fretboard-segment.webp",
    mediaAlt: "A hand-drawn guitar fretboard",
    text: "Open Tools to generate playing coordinates, optimize fingering, quantize timing, merge notes, and perform other track-wide edits.",
    mediaPosition: "center",
  },
];

export const EDITOR_TUTORIAL_GUEST_STORAGE_KEY = "note2tabs.editorTutorialInteracted.v1";
