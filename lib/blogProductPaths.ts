export type BlogProductPath = {
  href: string;
  label: string;
  description: string;
};

const editorPath: BlogProductPath = {
  href: "/editor",
  label: "Online guitar tab editor",
  description: "Write, arrange, play, and practise an editable tab in your browser.",
};

export function getBlogProductPaths(slug: string, title: string): BlogProductPath[] {
  const topic = `${slug} ${title}`.toLowerCase();

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
