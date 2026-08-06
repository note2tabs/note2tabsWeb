const fs = require("node:fs");
const path = require("node:path");
const { Prisma, PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const SHOULD_APPLY = process.argv.includes("--apply");

const PRODUCT_POSITIONING_INTRO = `Note2Tabs offers two connected products that also work independently. The transcriber turns audio into structured, playable guitar tablature. The browser editor is a complete workspace for writing tabs from scratch, importing files, arranging songs, choosing fingerings, playing tabs back, practising sections, and exporting finished work.`;

const REWRITES = {
  "guitar-tab-editor": {
    title: "Online Guitar Tab Editor: Write, Arrange, and Practice Tabs",
    excerpt:
      "Explore a complete browser-based guitar tab editor for writing music, arranging tracks, choosing fingerings, using playback, practising sections, and exporting your work.",
    seoTitle: "Online Guitar Tab Editor for Writing, Playback and Practice",
    seoDescription:
      "Write and arrange guitar tabs online with fingering tools, chord tracks, playback, practice loops, section controls, import, export, and optional audio transcription.",
    content: `# Online Guitar Tab Editor: Write, Arrange, and Practice Tabs

A guitar tab editor should be more than a place to type fret numbers. It should help you turn a musical idea into a complete arrangement, hear how it sounds, make guitar-specific choices, and practise the result without moving between several applications.

${PRODUCT_POSITIONING_INTRO}

Open the [Note2Tabs guitar tab editor](/editor) whenever you want to start creating. No transcription is required.

## Start from a blank tab

The editor opens as a creative workspace in its own right. Write a riff, solo, chord progression, fingerstyle part, lesson exercise, or complete song directly in the browser. Multiple tracks let you keep rhythm guitar, lead parts, chord tracks, and alternate ideas inside one project.

Starting blank is useful when you already know the part, are writing original music, or want to build teaching material one phrase at a time.

## Make guitar-specific decisions

The same pitch can often be played on several strings. Note2Tabs keeps pitch and fretboard position connected so you can compare positions in context instead of treating tablature as plain text.

Use the editor to:

- choose alternative string and fret positions
- optimize a phrase around a comfortable hand position
- create chord tracks and compare chord voicings
- add bends, slides, hammer-ons, pull-offs, and strumming patterns
- organize verses, choruses, solos, and practice sections

These are creative arrangement decisions, whether the tab began on a blank canvas, in an imported file, or with the transcriber.

## Hear and practise what you write

Playback keeps composition and learning connected. Listen after changing a rhythm or fingering, loop a difficult group of bars, slow the music down, and use speed training to build toward the original tempo.

Because practice tools use the same project as the editor, you can move between writing, listening, and playing without maintaining a separate practice copy.

## Import, export, and transcription are optional starting points

You can import supported ASCII tab, MusicXML, MIDI, and Guitar Pro files when work already exists elsewhere. You can also use the [audio transcriber](/transcribe) when a recording is the fastest way to begin. A transcription opens as a native editor project with the same tools as a tab written by hand.

Neither workflow limits the other. The editor is complete without transcription, and transcription becomes more useful because it connects directly to a capable editor.

## FAQ

### Is the Note2Tabs editor free to try?

Yes. Guest mode lets you open a blank tab and start creating without an account. Sign in when you want to save projects in your library.

### Do I need to upload audio?

No. Open the editor directly, write from scratch, or import a supported tab file. Audio transcription is an optional additional starting point.

### Can I practise inside the editor?

Yes. Use playback, looping, tempo controls, and speed training in the same project where you write and arrange the tab.

## Create your next tab

Open the [online guitar tab editor](/editor) to write from scratch, or use the [transcriber](/transcribe) when you want Note2Tabs to create a tab from a recording.`,
  },
  "ai-guitar-tab-editor": {
    title: "AI Guitar Tab Editor: Create, Arrange, and Practice Tabs Online",
    excerpt:
      "See how AI transcription and a complete guitar tab editor work together while remaining useful as independent products.",
    seoTitle: "AI Guitar Tab Editor for Creation, Arrangement and Practice",
    seoDescription:
      "Generate guitar tabs from audio or use the complete Note2Tabs editor independently for writing, arranging, fingering, playback, practice, import, and export.",
    content: `# AI Guitar Tab Editor: Create, Arrange, and Practice Tabs Online

An AI guitar tab workflow is most powerful when transcription and editing are both strong products. Note2Tabs connects them without making either one dependent on the other.

${PRODUCT_POSITIONING_INTRO}

## What the transcriber creates

Upload audio or choose a YouTube segment and Note2Tabs analyzes pitch, timing, and guitar position to create structured tablature. The result is not a static image: it is a native project with tracks, timed notes, and playable fretboard positions.

You can play the tab immediately, save it, export it, or open it in the editor for arranging and practice.

## What the editor does on its own

The [online guitar tab editor](/editor) is designed for creating music from a blank canvas as well as opening transcriptions. Write riffs and solos, build chord tracks, arrange sections, choose fingerings, add guitar techniques, and manage multiple tracks without uploading any audio.

This makes the editor useful for songwriters, teachers, learners, cover artists, and anyone building a personal tab library.

## One project from creation to practice

When you do begin with AI transcription, the project arrives in the same editor you would use for a hand-written tab. There is no reduced “transcription editor” with a smaller toolset.

Inside the project you can:

- compare fretboard positions for the same pitch
- create and edit chord voicings and strumming patterns
- add bends, slides, hammer-ons, and pull-offs
- structure tracks and song sections
- use playback, loops, tempo controls, and speed training
- import supported formats and export your work

## Choose the starting point that fits the job

Start with the transcriber when you have a recording and want the fastest path from sound to tablature. Start with a blank editor when you already know the music, are composing something new, or want complete manual control. Import a file when the tab already exists in another format.

All three paths lead to a full editor project.

## FAQ

### Is the editor only for AI-generated tabs?

No. It is a complete standalone guitar tab editor. AI transcription is one optional way to start a project.

### Can I generate a tab from MP3 or WAV?

Yes. Note2Tabs supports common audio formats and creates structured guitar tablature from the section you choose.

### Can I write an entire song manually?

Yes. Create multiple tracks, write notes and chords, arrange sections, use playback and practice tools, and save or export the finished project.

## Try either workflow

[Open the editor](/editor) to create a tab yourself, or [start with audio](/transcribe) to generate a project from a recording.`,
  },
  "how-to-fix-ai-guitar-tabs": {
    title: "How to Personalize AI Guitar Tabs for the Way You Play",
    excerpt:
      "Use fingering, arrangement, technique, playback, and practice tools to personalize an AI-generated guitar tab around your hands and musical goals.",
    seoTitle: "How to Personalize AI Guitar Tabs for Your Playing Style",
    seoDescription:
      "Personalize AI guitar tabs with alternate fingerings, chord voicings, techniques, song sections, playback, loops, and practice tools in Note2Tabs.",
    content: `# How to Personalize AI Guitar Tabs for the Way You Play

AI transcription gives you structured guitar tablature from a recording. Personalization is the next creative opportunity: choose how the part sits under your hands, how sections are organized, and which musical details you want represented.

${PRODUCT_POSITIONING_INTRO}

This guide focuses on personalization, not repair. The same tools are available for tabs you generate, import, or write from scratch.

## Choose positions that fit your hands

One pitch can appear in several places on the fretboard. The best position depends on the surrounding phrase, your preferred hand position, tone, and playing style.

In the [guitar tab editor](/editor), compare equivalent positions and keep phrases within a comfortable area of the neck. Fingering optimization can suggest a connected path while leaving the final choice to you.

## Shape chords and rhythm guitar

Chord symbols do not capture every musical decision. Try alternative voicings, view chord diagrams, create a dedicated chord track, and place individual downstrokes, upstrokes, and muted strokes.

These options let two players use the same underlying harmony while creating arrangements that feel different.

## Add expressive techniques

Bends, slides, hammer-ons, pull-offs, and rhythmic articulation affect how a phrase is read and played. Add them directly to note events so the tab carries more of the performance information you care about.

You can also use key detection and scale-aware movement while experimenting with melodic alternatives.

## Organize the song around practice

Divide the project into meaningful sections such as an intro, verse, chorus, bridge, and solo. Copy repeated bars, rearrange sections, and create focused loops for the passages you want to learn.

Playback and speed training let you hear the arrangement and practise it without leaving the editor.

## Keep transcription and editing in perspective

The [AI transcriber](/transcribe) is a fast route from sound to a playable tab. The editor is a complete product for creation, arrangement, and practice. You can use them together, or use the editor independently for original music, lessons, and manually written tabs.

## FAQ

### Can I choose a different fingering from the generated position?

Yes. Move notes to equivalent string and fret positions or use fingering optimization to explore alternatives.

### Can I add chords and guitar techniques?

Yes. Create chord tracks and strumming patterns, then add bends, slides, hammer-ons, and pull-offs to melodic parts.

### Can I use these tools without AI transcription?

Yes. Open a blank tab or import a supported file. Every personalization, playback, practice, and export tool remains available.

## Make the tab your own

Open the [Note2Tabs editor](/editor) to personalize an existing project, or [create a tab from audio](/transcribe) when you want to begin with a recording.`,
  },
  "how-to-convert-audio-to-guitar-tabs": {
    title: "How to Convert Audio to Guitar Tabs: A Playable, Editable Workflow",
    excerpt:
      "Learn how to turn MP3, WAV, and YouTube audio into structured guitar tablature, then play, arrange, practise, and export it with Note2Tabs.",
    seoTitle: "How to Convert Audio to Guitar Tabs Online | Note2Tabs",
    seoDescription:
      "Convert MP3, WAV, and YouTube audio into structured, editable guitar tabs with guidance on source selection, transcription, playback, arrangement, and export.",
    content: `# How to Convert Audio to Guitar Tabs: A Playable, Editable Workflow

Audio-to-tab conversion turns a performance into structured tablature with notes, timing, tracks, and playable guitar positions. Note2Tabs keeps that result editable so it can move naturally into arrangement, playback, practice, and export.

${PRODUCT_POSITIONING_INTRO}

## Choose the source that exposes the guitar clearly

The transcriber can capture more musical detail when the guitar is easy to hear. An isolated stem, direct recording, lesson, cover, rehearsal take, or focused song section gives the model a clear view of note attacks and timing.

MP3 is convenient and compact. WAV and FLAC can preserve more source detail. A clear performance matters more than the file extension, so choose the version where the guitar part is most present.

## Select the right amount of music

Use a short riff, solo, or chord passage when you only need one section. Focused clips process quickly and make it easy to play the generated tab alongside the source.

Premium audio upload also supports full-length transcription when you want a complete song in one project. YouTube mode is designed for focused segments from public videos.

## Generate structured tablature

Note2Tabs analyzes pitch and timing, maps notes to guitar positions, and creates a project you can open directly. Tracks and timed note events remain editable rather than being flattened into a picture.

Tell the transcriber when the recording includes other instruments or multiple guitars so it can use the appropriate processing path.

## Use the editor as much—or as little—as you want

The generated project is ready for playback and practice. You can also use the editor to choose alternate fingerings, build chord tracks, add techniques, arrange sections, create loops, or export to supported formats.

These editing tools are creative capabilities rather than a requirement for making transcription useful. The editor also works independently for tabs written from scratch or imported from other files.

## A simple audio-to-tab workflow

1. Choose an audio file or YouTube segment.
2. Select the section and source options.
3. Generate the guitar tab.
4. Open the project for playback, arrangement, or practice.
5. Save it to your library or export it.

## FAQ

### Which audio formats can I upload?

Note2Tabs accepts common formats including MP3, WAV, M4A, AAC, FLAC, OGG, and WebM, subject to plan limits.

### Can I transcribe a full song?

Yes. Premium supports full-length uploaded audio transcription. YouTube input currently uses focused clips.

### Do I need to use the editor afterward?

No. Transcription produces structured, playable tablature. The editor is available when you want additional arrangement, fingering, practice, or export control.

## Start from sound

Open the [audio-to-tab transcriber](/transcribe) when you have a recording ready, or visit the [standalone editor](/editor) to create a tab manually.`,
  },
};

const repositionLanguage = (value) => {
  if (!value) return value;

  return value
    .replace(/\bfirst draft\b/gi, "generated tab")
    .replace(/\bfirst drafts\b/gi, "generated tabs")
    .replace(/\brough draft\b/gi, "tab")
    .replace(/\brough drafts\b/gi, "tabs")
    .replace(/\bdraft tab\b/gi, "tab")
    .replace(/\bdraft tabs\b/gi, "tabs")
    .replace(/\btab draft\b/gi, "tab")
    .replace(/\btab drafts\b/gi, "tabs")
    .replace(/\bgenerated draft\b/gi, "generated tab")
    .replace(/\bgenerated drafts\b/gi, "generated tabs")
    .replace(/\bAI draft\b/gi, "AI-generated tab")
    .replace(/\bAI drafts\b/gi, "AI-generated tabs")
    .replace(/\btranscription draft\b/gi, "transcription")
    .replace(/\btranscription drafts\b/gi, "transcriptions")
    .replace(/\bdrafts\b/gi, "tabs")
    .replace(/\bdraft\b/gi, "tab")
    .replace(/\brough\b[ \t]*/gi, "")
    .replace(/\bcleanup workflow\b/gi, "editing workflow")
    .replace(/\bcleanup pass\b/gi, "editing pass")
    .replace(/\bcleanup work\b/gi, "editing work")
    .replace(/\bcleanup\b/gi, "editing")
    .replace(/\bcleaning up\b/gi, "shaping")
    .replace(/\bclean up\b/gi, "edit")
    .replace(/\bgenerated tabs is\b/gi, "generated tab is")
    .replace(/\buseful generated tabs\b/gi, "useful tab")
    .replace(/\busable generated tabs\b/gi, "usable tab")
    .replace(/\bgenerate a generated tab\b/gi, "generate a tab")
    .replace(/\bthe generated tabs\b/gi, "the generated tab")
    .replace(/\ba idea\b/gi, "an idea")
    .replace(/\ba editable\b/gi, "an editable")
    .replace(/\ban tab\b/gi, "a tab")
    .replace(/\btab tab\b/gi, "tab")
    .replace(/\n{3,}/g, "\n\n");
};

const countWords = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

const validatePost = (post) => {
  const searchable = [
    post.title,
    post.excerpt,
    post.seoTitle,
    post.seoDescription,
    post.content,
  ].join("\n");
  const errors = [];

  if (/\b(rough|drafts?|cleanup)\b/i.test(searchable)) {
    errors.push("contains deprecated rough/draft/cleanup positioning");
  }
  if (/\b(a idea|a editable|an tab|tab tab|generated tabs is)\b/i.test(searchable)) {
    errors.push("contains a known grammar regression");
  }
  if (countWords(post.content) < 250) {
    errors.push(`content is too short (${countWords(post.content)} words)`);
  }
  if (!post.title || !post.excerpt || !post.content) {
    errors.push("is missing required editorial content");
  }
  return errors;
};

const buildUpdatedPost = (post) => {
  const rewrite = REWRITES[post.slug] || {};
  const updated = {
    ...post,
    title: rewrite.title || repositionLanguage(post.title),
    excerpt: rewrite.excerpt || repositionLanguage(post.excerpt),
    seoTitle: rewrite.seoTitle || repositionLanguage(post.seoTitle),
    seoDescription:
      rewrite.seoDescription || repositionLanguage(post.seoDescription),
    content: rewrite.content || repositionLanguage(post.content),
  };

  const FIELD_OVERRIDES = {
    "guitar-pro-alternative-online": {
      excerpt:
        "Compare desktop tab software with browser-based guitar tab editors, and learn when an online Guitar Pro alternative is enough for writing, arranging, and practising tabs.",
    },
    "guitar-tab-maker-vs-guitar-tab-editor": {
      excerpt:
        "Understand the difference between a guitar tab maker and a guitar tab editor so you can choose the right workflow for writing, arranging, or practising tabs.",
    },
    "wav-to-guitar-tabs": {
      title: "WAV to Guitar Tabs: When a Clean Audio File Gives You a Better Result",
    },
  };

  Object.assign(updated, FIELD_OVERRIDES[post.slug] || {});
  updated.content = updated.content
    .replace(/\bthe tab is ,/gi, "the tab still needs work,")
    .replace(/^## edit\b/gm, "## Edit")
    .replace(/\bwriting, fixing, and practicing\b/gi, "writing, arranging, and practising")
    .replace(/\bcreate, fix, and practice\b/gi, "create, arrange, and practise");

  return updated;
};

async function main() {
  const posts = await prisma.post.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { slug: "asc" },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      seoTitle: true,
      seoDescription: true,
      content: true,
      contentHtml: true,
      contentToc: true,
      updatedAt: true,
    },
  });

  const backupPath = path.join(
    "/tmp",
    `note2tabs-blog-positioning-backup-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(backupPath, JSON.stringify(posts, null, 2), { mode: 0o600 });

  const updates = posts.map(buildUpdatedPost);
  const previewPath = backupPath.replace("-backup-", "-preview-");
  fs.writeFileSync(previewPath, JSON.stringify(updates, null, 2), { mode: 0o600 });
  const validationErrors = updates.flatMap((post) =>
    validatePost(post).map((error) => `${post.slug}: ${error}`)
  );

  if (validationErrors.length > 0) {
    throw new Error(`Blog rewrite validation failed:\n${validationErrors.join("\n")}`);
  }

  const changed = updates.filter((post, index) => {
    const original = posts[index];
    return (
      ["title", "excerpt", "seoTitle", "seoDescription", "content"].some(
        (field) => post[field] !== original[field]
      ) ||
      original.contentHtml !== null ||
      original.contentToc !== null
    );
  });

  console.log(
    JSON.stringify(
      {
        mode: SHOULD_APPLY ? "apply" : "dry-run",
          backupPath,
          previewPath,
        publishedPosts: posts.length,
        changedPosts: changed.length,
        handWrittenRewrites: Object.keys(REWRITES),
        sample: changed.slice(0, 5).map((post) => ({
          slug: post.slug,
          title: post.title,
          words: countWords(post.content),
        })),
      },
      null,
      2
    )
  );

  if (!SHOULD_APPLY) return;

  await prisma.$transaction(
    changed.map((post) =>
      prisma.post.update({
        where: { id: post.id },
        data: {
          title: post.title,
          excerpt: post.excerpt,
          seoTitle: post.seoTitle,
          seoDescription: post.seoDescription,
          content: post.content,
          contentHtml: null,
          contentToc: Prisma.JsonNull,
        },
      })
    )
  );
  console.log(`Updated ${changed.length} published posts.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
