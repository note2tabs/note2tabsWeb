import { instrumentGuides } from "./instrumentGuideIndex";
import { transcriptionEntryHref } from "./instrumentTranscriptionEntry";
import { localeHref, type AppLocale } from "./i18n/locale";

/** Correct the known tool-labelled article link without rewriting editorial links. */
export function directBlogProductLinks(html: string, locale: AppLocale) {
  return html.replace(/<a\b([^>]*?)href="(?:https:\/\/(?:www\.)?note2tabs\.com)?\/blog\/how-to-convert-audio-to-guitar-tabs"([^>]*)>([\s\S]*?)<\/a>/gi,
    (anchor, before, after, label) => label.replace(/<[^>]*>/g, "").trim().toLowerCase() === "audio to guitar tab converter"
      ? `<a${before}href="${localeHref("/transcribe", locale)}"${after}>${label}</a>` : anchor)
    .replace(/(<a\b[^>]*?href=")(?:https:\/\/(?:www\.)?note2tabs\.com)?\/(?:es\/|pt-br\/|ja\/|ko\/|pl\/|zh-hans\/|ar\/|fr\/|it\/)?editor\/?(")/gi, "$1/gte/new$2");
}

export type BlogProductPath = {
  href: string;
  label: string;
  description: string;
};

const instrumentProductPaths = (topic: string): BlogProductPath[] | null => {
  const routes = /piano/.test(topic) ? { name: "Piano", editorLabel: "Piano music notation editor", transcribe: "/piano-transcription", editor: "/piano-sheet-music-editor" }
    : /drum/.test(topic) ? { name: "Drum", editorLabel: "Drum notation editor", transcribe: "/drum-transcription", editor: "/drum-notation-editor" }
    : /ukulele|ukelele/.test(topic) ? { name: "Ukulele", editorLabel: "Ukulele tab editor", transcribe: "/ukulele-transcription", editor: "/ukulele-tab-editor" }
    : /bassline|\bbass\b/.test(topic) ? { name: "Bass", editorLabel: "Bass tab maker and editor", transcribe: "/audio-to-bass-tabs", editor: "/bass-tab-editor" } : null;
  return routes ? [
    { href: routes.transcribe, label: `${routes.name} transcription`, description: "Start from a recording and review the notes and timing." },
    { href: routes.editor, label: routes.editorLabel, description: "Write, edit and play the part in your browser." },
  ] : null;
};

/** Match the reader's task, rather than incidental words in a long title. */
export function getBlogPrimaryAction(slug: string, title: string) {
  const topic = `${slug} ${title}`.toLowerCase();
  const instrument = /piano/.test(topic) ? "piano" : /drum/.test(topic) ? "drums" : /ukulele|ukelele/.test(topic) ? "ukulele" : /bassline|\bbass\b/.test(topic) ? "bass" : null;
  if (instrument) {
    const guide = instrumentGuides.find(item => item.slug === slug);
    const transcribe = guide ? guide.goal === "transcribe" : /transcri|audio|recording/.test(topic);
    return { href: transcribe ? transcriptionEntryHref(instrument, guide?.mode === "youtube") : `/gte/new?track=${instrument}`, label: transcribe ? "Transcribe audio" : "Open the editor", cta: transcribe ? "blog_transcribe" : "blog_editor" };
  }
  const editorial = /note-to-tab|fingering|practice|how-to-(?:write|edit|read)|import-export|guitar-pro-alternative/.test(slug);
  const transcribe = !editorial && /youtube|\bmp3\b|\bwav\b|audio|recording|transcri|generator|song-to/.test(topic);
  return {
    href: transcribe ? (/youtube/.test(topic) ? "/transcribe?mode=youtube" : "/transcribe") : "/gte/new",
    label: transcribe ? "Transcribe audio" : "Open the editor",
    cta: transcribe ? "blog_transcribe" : "blog_editor",
  };
}

const editorPath: BlogProductPath = {
  href: "/gte/new",
  label: "Online guitar tab editor",
  description: "Write, arrange, play, and practise an editable tab in your browser.",
};

export function getBlogProductPaths(slug: string, title: string): BlogProductPath[] {
  const topic = `${slug} ${title}`.toLowerCase();

  const instrumentPaths = instrumentProductPaths(topic);
  if (instrumentPaths) return instrumentPaths;

  if (/youtube|video/.test(topic)) {
    return [
      {
        href: "/youtube-to-guitar-tabs",
        label: "YouTube to guitar tabs converter",
        description: "Choose a riff or solo from a public video and generate an editable tab.",
      },
      editorPath,
    ];
  }

  if (/\bmp3\b/.test(topic)) {
    return [
      {
        href: "/mp3-to-guitar-tabs",
        label: "MP3 to guitar tabs converter",
        description: "Upload an MP3 and turn its notes and timing into structured tablature.",
      },
      editorPath,
    ];
  }

  if (/\bai\b|generator|transcri|song-to/.test(topic)) {
    return [
      {
        href: "/ai-guitar-tab-generator",
        label: "Free AI guitar tab generator",
        description: "Generate an editable guitar tab from an audio file or YouTube clip.",
      },
      editorPath,
    ];
  }

  if (/audio|recording|\bwav\b|convert/.test(topic)) {
    return [
      {
        href: "/audio-to-guitar-tab-converter",
        label: "Audio to guitar tab converter",
        description: "Convert MP3, WAV, M4A, FLAC, and other recordings into editable tabs.",
      },
      editorPath,
    ];
  }

  return [
    editorPath,
    {
      href: "/free-guitar-tab-maker",
      label: "Free guitar tab maker",
      description: "Start with a blank tab and create the complete arrangement yourself.",
    },
  ];
}
