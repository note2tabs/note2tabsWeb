const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const UPDATES = [
  {
    slug: "the-best-ai-guitar-tab-generator-online-turn-any-song-into-tabs-instantly",
    seoTitle: "Best AI Guitar Tab Generator | Editable Tabs with Note2Tabs",
    seoDescription:
      "Compare what makes an AI guitar tab generator useful: clear source audio, editable tabs, playback, fingering control, and realistic cleanup.",
    insertBefore: "## What makes an AI guitar tab generator worth using",
    section: `## Who this guide is for

This page is for players comparing AI guitar tab tools and deciding what actually matters. If you already know you want a step-by-step workflow, read the [AI guitar tab generator guide](/blog/how-to-use-an-ai-guitar-tab-generator-to-transcribe-songs-in-minutes). If your source is specifically a YouTube video, use the [YouTube to guitar tabs workflow](/blog/youtube-to-guitar-tabs-workflow).

The main point here is quality control: choose a tool that gives you an editable draft, not a black-box promise of perfect one-click tabs.
`,
  },
  {
    slug: "how-to-convert-audio-to-guitar-tabs",
    insertBefore: "## What audio-to-tab conversion actually does",
    section: `## When this guide is the right starting point

Use this guide when your main question is broad: how does audio become an editable guitar tab? For format-specific advice, use the [MP3 to guitar tabs](/blog/mp3-to-guitar-tabs) or [WAV to guitar tabs](/blog/wav-to-guitar-tabs) guides. For video sources, use the [YouTube to guitar tabs workflow](/blog/youtube-to-guitar-tabs-workflow).

That separation matters because the search intent is different. This page explains the full audio-to-tab workflow. The format pages help you choose and prepare a better source file.
`,
  },
  {
    slug: "ai-guitar-tab-generator-convert-any-song-even-youtube-into-tabs",
    insertBefore: "## How AI turns audio into guitar tabs",
    section: `## Best use case for this workflow

Use this page when you want one path for both uploaded audio and YouTube sources. If you are still comparing tools, start with the [best AI guitar tab generator guide](/blog/the-best-ai-guitar-tab-generator-online-turn-any-song-into-tabs-instantly). If you already have an MP3 or WAV file, the [audio to guitar tab converter guide](/blog/how-to-convert-audio-to-guitar-tabs) gives more source-preparation detail.

This page focuses on the practical promise: generate a draft from the source you have, then edit the tab until it becomes playable.
`,
  },
  {
    slug: "note-to-tab-converter-how-to-turn-guitar-notes-into-tablature-online",
    insertBefore: "## Why notes do not map to one tab position",
    section: `## How this differs from audio-to-tab conversion

A note-to-tab converter starts from known pitches. An audio-to-tab converter starts from a recording and has to estimate the notes first. That makes this workflow useful for melodies, MIDI-like ideas, written notes, or riffs you already understand.

If your starting point is a recording instead, use the [audio to guitar tab converter](/blog/how-to-convert-audio-to-guitar-tabs). If your starting point is a playable draft that needs cleanup, use the [guitar tab editor](/online-guitar-tab-editor).
`,
  },
  {
    slug: "how-to-use-an-ai-guitar-tab-generator-to-transcribe-songs-in-minutes",
    insertBefore: "## Step 1: choose the cleanest source",
    section: `## Use this as a checklist, not a promise of perfection

This guide is intentionally procedural. It is for the moment when you already want to try a song and need the right order of operations. The shortcut is not skipping review; the shortcut is getting to an editable draft quickly.

If you want a broader explanation first, read [how to convert audio to guitar tabs](/blog/how-to-convert-audio-to-guitar-tabs). If the draft is already generated and feels wrong, jump to [how to fix AI guitar tabs](/blog/how-to-fix-ai-guitar-tabs).
`,
  },
  {
    slug: "manual-vs-ai-guitar-transcription-which-is-better-for-guitar-players",
    insertBefore: "## What manual transcription does well",
    section: `## Quick decision rule

Use manual transcription when the goal is ear training or when tiny phrasing details matter. Use AI transcription when the goal is speed, a usable first draft, or practice material for a song that has no reliable tab.

For most players, the strongest workflow is not either-or. Generate a draft, then use your ear and the [guitar tab editor](/online-guitar-tab-editor) to make the final playing decisions.
`,
  },
  {
    slug: "how-to-learn-guitar-faster-using-ai-tools",
    insertBefore: "## Use AI to create better practice material",
    section: `## What AI should and should not do for practice

AI should reduce setup time. It should help you get from a song idea to editable practice material faster. It should not replace listening, slow practice, timing work, or the physical judgment of whether a fingering feels good.

That distinction keeps the workflow useful for learning instead of turning it into passive tab collection.
`,
  },
  {
    slug: "youtube-to-guitar-tabs-workflow",
    insertBefore: "## Choose the right YouTube source",
    section: `## Why YouTube needs its own workflow

YouTube sources vary more than local audio files. A clean lesson, cover, or playthrough can work well, while a noisy live clip may produce a messy draft. This guide focuses on choosing better videos and reviewing the result.

If you already have a clean local file, use the [MP3 to guitar tabs](/blog/mp3-to-guitar-tabs) or [WAV to guitar tabs](/blog/wav-to-guitar-tabs) guide instead.
`,
  },
  {
    slug: "how-to-fix-ai-guitar-tabs",
    insertBefore: "## Why AI tabs often need cleanup",
    section: `## Use this after generation

This is the repair guide. If you have not generated a draft yet, start with the [AI guitar tab generator](/ai-guitar-tab-generator) or the [audio-to-tab workflow](/blog/how-to-convert-audio-to-guitar-tabs). Come back here when the output is close enough to keep but still awkward to play.

The goal is to improve the useful draft, not to pretend the first output was final.
`,
  },
];

function insertSection(content, marker, section) {
  if (content.includes(section.trim())) return content;
  const index = content.indexOf(marker);
  if (index === -1) {
    return `${content.trim()}\n\n${section.trim()}\n`;
  }
  return `${content.slice(0, index).trim()}\n\n${section.trim()}\n\n${content.slice(index).trim()}\n`;
}

async function main() {
  const results = [];

  for (const update of UPDATES) {
    const post = await prisma.post.findUnique({
      where: { slug: update.slug },
      select: {
        id: true,
        content: true,
        seoTitle: true,
        seoDescription: true,
      },
    });

    if (!post) {
      results.push(`missing: ${update.slug}`);
      continue;
    }

    const content = insertSection(post.content, update.insertBefore, update.section);
    await prisma.post.update({
      where: { id: post.id },
      data: {
        content,
        contentHtml: null,
        contentToc: undefined,
        seoTitle: update.seoTitle || post.seoTitle,
        seoDescription: update.seoDescription || post.seoDescription,
      },
    });

    results.push(`updated: ${update.slug}`);
  }

  console.log(results.join("\n"));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
