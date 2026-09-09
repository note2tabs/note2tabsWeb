export type EditorTutorialCard = {
  id: string;
  eyebrow: string;
  title: string;
  imageSrc: string;
  imageAlt: string;
  text: string;
  imagePosition?: string;
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
    imageSrc: "/images/editor-previews/Editor-main.webp",
    imageAlt: "The Note2Tabs editor canvas with notes arranged on guitar strings",
    text: "Click an empty position to add a note. Select notes and chords to move, resize, copy, or change their fingering.",
    imagePosition: "center 34%",
  },
  {
    id: "tracks",
    eyebrow: "Tracks",
    title: "Keep every part organized",
    imageSrc: "/images/editor-previews/collage.webp",
    imageAlt: "Several Note2Tabs editor views arranged together",
    text: "Use the track menu to switch parts. The pencil opens instrument, tuning, playback, offset, and removal settings.",
    imagePosition: "center 42%",
  },
  {
    id: "playback",
    eyebrow: "Listen and practice",
    title: "Hear changes as you work",
    imageSrc: "/images/editor-previews/collage-training.webp",
    imageAlt: "Note2Tabs playback and practice tools",
    text: "Play from anywhere, loop a section, add a metronome, slow the song down, or move into Practice mode for a focused view.",
    imagePosition: "center 48%",
  },
  {
    id: "tools",
    eyebrow: "Editing tools",
    title: "Let the editor handle the repetitive work",
    imageSrc: "/images/doodles/fretboard-segment.webp",
    imageAlt: "A hand-drawn guitar fretboard",
    text: "Open Tools to generate playing coordinates, optimize fingering, quantize timing, merge notes, and perform other track-wide edits.",
    imagePosition: "center",
  },
];

export const EDITOR_TUTORIAL_GUEST_STORAGE_KEY = "note2tabs.editorTutorialInteracted.v1";
