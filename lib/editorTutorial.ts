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
    eyebrow: "Editing notes",
    title: "Move and resize notes",
    mediaSrc: "/videos/tutorials/tutvid02.mp4",
    mediaAlt: "Moving and resizing notes on the Note2Tabs canvas",
    mediaType: "video",
    mediaFit: "cover",
    text: "Move the notes by mouse or {g}. Scale them by dragging the edge or by {s}. Use {boxSelect}/{shift} to select multiple notes or {a} to select all.",
  },
  {
    id: "playback",
    eyebrow: "Canvas setup",
    title: "Editing Controls",
    mediaSrc: "/videos/tutorials/tut03.png",
    mediaAlt: "Note2Tabs editing settings for note size, cursor size, grid snapping, and key snapping",
    mediaFit: "cover",
    mediaPosition: "left center",
    text: "Change the default note size with {comma}/{period} and the cursor size with {n}/{m}. The {gridOn} snaps notes to grid and {keyOn} snaps notes to the musical key.",
  },
  {
    id: "tools",
    eyebrow: "Fingering",
    title: "Smart fingering",
    mediaSrc: "/videos/tutorials/tutvid04.mp4",
    mediaAlt: "Optimizing note fingering and playing coordinates in Note2Tabs",
    mediaType: "video",
    mediaFit: "cover",
    text: "Change the fingering of a note from the note menu or choose the best fingering automatically in {tools} {right} {optimizeFingering}, or change the playing coordinate {coordinate} to where you want to play by selecting the notes and clicking {tools} {right} {optimizeCoordinates} / {o}. You can add or remove sections from the playing coordinates {coordinate} by right-clicking.",
  },
  {
    id: "create",
    eyebrow: "Your music",
    title: "Make the tab your own",
    mediaSrc: "/videos/tutorials/tut05.png",
    mediaAlt: "A complete song arranged across several rows in the Note2Tabs editor",
    mediaFit: "contain",
    text: "Switch, add or change tracks, compose your own songs or try to play the song in practice mode. Press {?} to bring up this tutorial again or {help} to see the keybinds. Have fun playing the guitar!",
  },
];

export const EDITOR_TUTORIAL_GUEST_STORAGE_KEY = "note2tabs.editorTutorialInteracted.v1";
