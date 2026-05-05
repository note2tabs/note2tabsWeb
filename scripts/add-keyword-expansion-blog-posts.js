const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const POSTS = [
  {
    title: "Song to Guitar Tabs: How to Turn a Recording Into a Playable Tab",
    slug: "song-to-guitar-tabs",
    excerpt:
      "Learn the practical song-to-guitar-tabs workflow: choose a clear recording, generate a draft, edit fingerings, check playback, and save a playable version.",
    seoTitle: "Song to Guitar Tabs | Turn Recordings Into Playable Tabs",
    seoDescription:
      "Convert a song to guitar tabs with a practical workflow for audio sources, AI drafts, fingering cleanup, playback, saving, and editing.",
    tags: ["audio-to-tabs", "ai-guitar-tabs", "guitar-tab-editor"],
    cluster: "audio-to-guitar-tabs",
    content: `Short answer: the best way to turn a song into guitar tabs is to generate a first draft from a clear recording, then edit that draft until it is playable. The draft saves time. The editor is where the song becomes a guitar part you can actually practice.

If you already have a song ready, start with the [audio to guitar tab converter](/audio-to-guitar-tab-converter) or the [AI guitar tab generator](/ai-guitar-tab-generator), then open the result in the editor.

## What song-to-tab conversion really means

Converting a song to guitar tabs is not only pitch detection. A tool has to estimate notes, timing, and guitar positions. That last step is the hard part because the same note can often be played on several strings.

That is why a good result needs two stages:

- generate the notes and timing quickly
- edit the string and fret choices like a guitarist

If you skip the editing stage, you may get a tab that looks complete but feels awkward.

## Choose the cleanest part of the song first

Start with the section you actually want to learn. A verse riff, intro, chorus, or solo is easier to check than an entire song. Shorter sections also make it easier to hear when the draft is wrong.

The best source is usually a clean guitar recording, lesson clip, cover, or isolated part. A full mix can work, but dense drums, vocals, and layered instruments make the result harder to clean up.

## Generate a draft, then judge it fairly

Do not expect the first draft to be final. A useful song-to-tabs tool should give you structure: likely notes, rough rhythm, and a playable starting point. After that, your job is to improve the parts that matter.

Ask these questions:

- Are the main notes close?
- Does the rhythm roughly follow the song?
- Are the fingerings comfortable enough to practice?
- Can I identify the sections that need cleanup?

If yes, the draft has done its job.

## Edit fingerings before you save

Many generated tabs fail because they choose strange positions. The notes may be correct, but the hand movement is not.

Use the [Guitar Editor Canvas](/editor) to move notes to better strings, keep phrases in one position where possible, and make repeated riffs consistent. A tab that is easier to play is more valuable than a tab that only looks complete.

## Use playback as your quality check

Playback helps you catch two different problems. If something sounds wrong, fix pitch or rhythm. If it sounds right but feels hard to play, fix fingering.

This is a simple review loop:

1. Generate the draft.
2. Listen to the section.
3. Fix notes that sound wrong.
4. Improve fingerings that feel awkward.
5. Save the playable version.

## FAQ

## Can any song be converted to guitar tabs?

Most songs can produce some kind of draft, but the quality depends on the source. Clear guitar recordings work better than dense mixes with many instruments.

## Is a song-to-tabs tool accurate enough to practice from?

It can be, but the best workflow is to edit the draft before using it for serious practice. Guitar fingering choices usually need human judgment.

## Should I use audio upload or YouTube?

Use audio upload when you have a clean MP3 or WAV file. Use [YouTube to guitar tabs](/youtube-to-guitar-tabs) when the best source is a video, cover, or lesson.

## Final thought

Song-to-tab conversion is most useful when it gets you past the blank page. Generate the draft, open it in the [editor](/editor), and turn it into the version your hands can actually play.`,
  },
  {
    title: "MP3 to Guitar Tabs: Convert an MP3 Into Editable Tablature",
    slug: "mp3-to-guitar-tabs",
    excerpt:
      "A practical MP3-to-guitar-tabs guide for musicians who want an editable draft, cleaner fingerings, playback checks, and a tab they can save.",
    seoTitle: "MP3 to Guitar Tabs | Convert MP3 Audio Into Editable Tab",
    seoDescription:
      "Convert MP3 files to guitar tabs with an AI-assisted workflow. Learn how to choose clean audio, generate a draft, edit fingerings, and save tabs.",
    tags: ["audio-to-tabs", "ai-guitar-tabs", "guitar-tab-editor"],
    cluster: "audio-to-guitar-tabs",
    content: `Short answer: to convert an MP3 to guitar tabs, upload the clearest MP3 you have, generate a tab draft, then edit the result for fingering and playability. MP3 is a good starting format, but the quality of the recording matters more than the file extension.

You can start from the [audio to guitar tab converter](/audio-to-guitar-tab-converter) and then clean up the result in the [Guitar Editor Canvas](/editor).

## Use the cleanest MP3 you can find

An MP3 with clear guitar will usually produce a better draft than a noisy live recording. If the guitar is buried under vocals, cymbals, or bass, the transcription will need more cleanup.

Good MP3 sources include:

- guitar covers
- lesson clips exported as audio
- demos with one main guitar part
- isolated practice recordings
- short song sections

If you have a choice, use the recording where the guitar part is easiest to hear.

## Start with a short section

Long MP3 files create more places for errors to appear. If you only need the intro, riff, or solo, start there. A short section is easier to review and faster to edit.

This also helps you decide whether the source is good enough before spending time on the whole song.

## Treat the output as a draft

The first MP3-to-tab result should be judged as a draft, not a final score. The useful question is whether it gets you closer to a playable tab faster than manual transcription.

A good draft should give you:

- a rough note path
- enough rhythm to recognize the phrase
- editable fret positions
- a clear place to begin cleanup

That is already valuable if the alternative is starting from silence.

## Fix the guitar-specific mistakes

MP3 conversion can estimate notes, but guitar tab also needs string choices. The same pitch can appear in different places on the fretboard, and only some positions feel good in context.

After generating the tab, check:

- unnecessary jumps up and down the neck
- repeated riffs with inconsistent fingerings
- chord shapes that are too stretched
- sections that sound close but feel awkward

Use the editor to move notes and simplify the tab before saving.

## Save or export after cleanup

Do not export the first draft unless you only need a rough reference. Save or export after the tab passes a basic playability check.

Before saving, ask whether you can use the tab tomorrow without remembering all the fixes in your head. If the tab explains the part clearly, it is ready to keep.

## FAQ

## Can I convert any MP3 to guitar tabs?

You can try, but clear guitar audio works best. Dense full-band MP3 files can still produce drafts, but they usually need more editing.

## Is MP3 better than WAV for guitar tab conversion?

WAV can preserve more audio detail, but a clean MP3 is often more useful than a noisy WAV. Source clarity matters most.

## Can I edit the MP3 tab after conversion?

Yes. That is the important part of the workflow. Open the draft in the editor, improve the fingerings, and save the playable version.

## Final thought

MP3-to-guitar-tabs conversion is a shortcut to the first draft. The real value comes when you edit that draft into something you can practice. Start with the [audio converter](/audio-to-guitar-tab-converter), then finish in the [editor](/editor).`,
  },
  {
    title: "WAV to Guitar Tabs: When a Clean Audio File Gives You a Better Draft",
    slug: "wav-to-guitar-tabs",
    excerpt:
      "Learn when WAV files help guitar tab conversion, how to prepare clean audio, and why editing the generated tab still matters.",
    seoTitle: "WAV to Guitar Tabs | Convert Clean Audio Into Editable Tab",
    seoDescription:
      "Use WAV files for guitar tab conversion when you want clean source audio, editable tab drafts, playback checks, and better fingering cleanup.",
    tags: ["audio-to-tabs", "ai-guitar-tabs", "guitar-tab-editor"],
    cluster: "audio-to-guitar-tabs",
    content: `Short answer: WAV files can be useful for guitar tab conversion because they often preserve more detail than compressed audio. But a clean performance matters more than the format. A clear WAV of one guitar part will usually beat a messy full-band recording.

Use the [audio to guitar tab converter](/audio-to-guitar-tab-converter) when you have a WAV file ready, then use the editor to clean up the result.

## Why WAV can help

WAV files are often less compressed than MP3 files. That can help when the recording has subtle note attacks, quiet phrases, or fast picking. More detail can give the transcription process a better source to work from.

But WAV is not magic. If the guitar is hidden under drums and vocals, the tab will still need cleanup.

## Record a better WAV before converting

If you are recording yourself, make the source simple:

- record one guitar part at a time
- reduce background noise
- avoid clipping
- keep the tempo steady
- trim silence before and after the section

The goal is not studio perfection. The goal is a clear signal that can become a useful draft.

## Convert the WAV into a draft

After upload, let the tool generate the first tab. Then check whether the main phrase is recognizable. If the structure is close, keep going. If the result is completely wrong, the source audio may be too noisy or too complex.

For long recordings, try a shorter section first. This is faster and gives you better feedback on whether the audio is usable.

## Edit the tab like a guitarist

Even with a high-quality WAV, the generated tab may choose awkward fret positions. This is normal. Guitar tab is not only about the notes; it is about where those notes live on the neck.

In the [Guitar Editor Canvas](/editor), look for:

- notes that jump to distant frets
- repeated phrases written differently
- chord shapes that are too hard at tempo
- sections that need clearer boundaries

Fix those before you save the tab.

## WAV vs MP3 for guitar tabs

Use WAV when you have control over the recording or want the cleanest source. Use MP3 when that is the file you already have and it sounds clear enough.

In practice, the best file is the one where the guitar is easiest to hear.

## FAQ

## Does WAV always create better guitar tabs than MP3?

No. WAV can preserve more detail, but a clean MP3 can outperform a noisy WAV. The clarity of the guitar part matters most.

## Should I convert a whole WAV file or a short section?

Start with a short section if the song is long or complex. It is easier to review and faster to edit.

## Can I use WAV recordings of my own playing?

Yes. That is one of the best use cases. Record a riff, convert it into a tab draft, then edit and save the version you want to keep.

## Final thought

WAV-to-guitar-tabs conversion works best when the audio is clean and the workflow stays editable. Generate the draft, check it with playback, and finish the tab in the [editor](/editor).`,
  },
  {
    title: "Free Online Guitar Tab Maker: What to Look For Before You Start",
    slug: "free-online-guitar-tab-maker",
    excerpt:
      "Compare what matters in a free online guitar tab maker: no download, fast editing, playback, saving, export, and a workflow that stays playable.",
    seoTitle: "Free Online Guitar Tab Maker | What Features Matter",
    seoDescription:
      "Learn what to look for in a free online guitar tab maker, including browser editing, playback, save/export options, fingering control, and practice workflows.",
    tags: ["guitar-tab-editor", "tab-editor", "online-guitar-tab-editor"],
    cluster: "guitar-tab-editor",
    content: `Short answer: a free online guitar tab maker should let you start quickly, write or edit tabs in the browser, check the result with playback, and save a version you can return to. The best tool is not only the fastest one; it is the one that helps you make a playable tab.

If you want a browser-based workflow, open the [online guitar tab editor](/online-guitar-tab-editor) or start from the [Guitar Editor Canvas](/editor).

## No download should mean less friction

The main benefit of an online tab maker is speed. You should not need to install desktop software just to capture a riff or clean up a practice tab.

That matters when:

- you have a quick songwriting idea
- you want to edit a generated draft
- you are on a borrowed computer
- you need a simple practice version fast

The tool should let you start before the idea disappears.

## Look for editing, not only typing

Some tools are good for typing fret numbers. That is useful, but it is not the whole job.

A stronger tab maker should let you revise the music. You should be able to move notes, adjust sections, improve fingerings, and keep the tab readable as it grows.

This is the difference between documenting an idea and building a useful practice tab.

## Playback makes the tab more trustworthy

Playback is one of the most important features because it turns the tab into something you can check by ear. If the phrase sounds wrong, you know where to edit. If it sounds right but feels awkward, you can focus on fingerings.

Without playback, you are mostly trusting the page.

## Saving matters more than it seems

If you spend time making a tab playable, you need a way to keep it. A free online tab maker should make it clear whether your work can be saved, exported, or revisited later.

For practice, saving is not a luxury. It is what lets you build a library of parts you actually use.

## Use AI only when it helps the workflow

AI can be useful if you are starting from audio, but it should not replace editing. A generated tab is still a draft.

The better workflow is:

1. Generate or write the first version.
2. Listen back.
3. Fix notes and fingerings.
4. Save the playable version.

That is why the editor matters as much as the generator.

## FAQ

## What is the best free online guitar tab maker?

The best choice depends on your goal. For quick scratch tabs, a simple maker may be enough. For practice tabs, choose a tool with playback, editing, saving, and fingering control.

## Do I need to create an account?

Some tools let you start without an account but require one for saving. If you are creating anything important, make sure the tool can preserve your work.

## Can an online tab maker replace desktop software?

For many writing and practice workflows, yes. For complex engraving or advanced notation, desktop software may still be useful. Browser-based tools are strongest when speed and editability matter.

## Final thought

A free online guitar tab maker should help you move from idea to playable tab with as little friction as possible. Start in the [editor](/editor), keep the part simple, and save the version you would actually practice.`,
  },
  {
    title: "Guitar Tab Creator With Playback: Why Listening Back Changes Everything",
    slug: "guitar-tab-creator-with-playback",
    excerpt:
      "A guitar tab creator with playback helps you catch wrong notes, awkward rhythms, and poor fingerings before you save or practice the tab.",
    seoTitle: "Guitar Tab Creator With Playback | Check Tabs by Ear",
    seoDescription:
      "Learn why playback matters in a guitar tab creator and how to use it to fix notes, rhythm, fingerings, sections, and practice-ready tabs.",
    tags: ["guitar-tab-editor", "tab-editor", "online-guitar-tab-editor"],
    cluster: "guitar-tab-editor",
    content: `Short answer: a guitar tab creator with playback helps you find mistakes faster because you can hear the tab, not just read it. Playback reveals wrong notes, uneven rhythms, and awkward edits before they become part of your practice routine.

Use the [Guitar Editor Canvas](/editor) when you want to write or clean up a tab and check the result by ear.

## Tabs can look right and still sound wrong

Guitar tab is visual. It tells you strings and frets, but it does not always make timing problems obvious. A phrase can look clean on the page and still sound rushed, late, or uneven.

Playback gives you a second check. If the sound does not match the part in your head, you know the tab needs more work.

## Playback separates note problems from fingering problems

When you listen back, you can tell whether the issue is musical or physical.

If the phrase sounds wrong, fix pitch or timing. If it sounds right but feels uncomfortable to play, fix the fingering.

That distinction saves time because you do not rewrite good notes just because the hand position is bad.

## Use playback in short loops

Do not wait until the whole tab is finished. Use playback after each important section.

A practical workflow:

1. Write or generate a short phrase.
2. Play it back.
3. Fix the obvious mistakes.
4. Try the phrase on guitar.
5. Adjust the fingering.

This keeps problems small.

## Playback is especially useful after AI transcription

Generated tabs need review. The draft may be close, but it can still choose strange rhythms, dense note groups, or awkward positions.

After using the [AI guitar tab generator](/ai-guitar-tab-generator), open the draft in the editor and listen to the sections that matter most. Then clean up the tab before saving.

## Do not ignore how the tab feels

Playback tells you how the tab sounds. Your hands tell you whether it is playable. You need both.

If a phrase sounds right but requires a huge position jump, try moving notes to another string. If a chord sounds right but is too hard at speed, test a simpler shape.

## FAQ

## Why is playback useful in a guitar tab editor?

Playback helps you catch wrong notes and timing issues faster than visual checking alone. It also helps you decide whether a generated draft is worth editing.

## Can playback tell me if a fingering is good?

Not completely. Playback tells you whether the notes sound right. You still need to test whether the fingering feels comfortable on the guitar.

## Should beginners use a tab creator with playback?

Yes. Beginners benefit from hearing mistakes immediately because it connects the written tab to the sound they are trying to play.

## Final thought

Playback turns a tab creator into a feedback tool. Write the part, listen back, fix what sounds wrong, then use the [editor](/editor) to make the fingering playable.`,
  },
  {
    title: "Guitar Fingering Optimizer: How to Make Tabs Easier to Play",
    slug: "guitar-fingering-optimizer",
    excerpt:
      "Learn how guitar fingering optimization works and how to use it to reduce awkward jumps, improve position choices, and make tabs easier to practice.",
    seoTitle: "Guitar Fingering Optimizer | Make Tabs Easier to Play",
    seoDescription:
      "Use guitar fingering optimization to improve tab playability, reduce position jumps, compare note choices, and clean up AI-generated guitar tabs.",
    tags: ["guitar-tab-editor", "tab-editor", "ai-guitar-tabs"],
    cluster: "guitar-tab-editor",
    content: `Short answer: a guitar fingering optimizer helps choose string and fret positions that are easier to play. It is useful because the same pitch can often appear in multiple places on the guitar, and the best choice depends on the phrase.

In Note2Tabs, you can use the [Guitar Editor Canvas](/editor) to optimize and review fingerings after writing or generating a tab.

## Why guitar fingering is hard for software

Guitar is not like piano. On piano, one pitch usually has one key. On guitar, the same pitch can appear on several strings. That gives players flexibility, but it also creates a decision problem.

A tab can have the correct notes and still be uncomfortable because the string choices are bad.

## What optimization tries to improve

Fingering optimization is not about making every phrase easy. Some music is simply hard. The goal is to reduce unnecessary difficulty.

Good optimization looks for:

- fewer awkward jumps
- smoother hand positions
- more consistent repeated phrases
- string choices that fit the surrounding notes
- chord shapes that make sense at tempo

That makes the tab easier to learn.

## When to use a fingering optimizer

Use optimization when a tab sounds close but feels strange. This often happens after AI transcription, MIDI conversion, or manual entry from note names.

The best moments to optimize are:

- after generating a draft
- after importing a phrase
- when one section feels uncomfortable
- before saving a practice version

Do not optimize blindly. Listen first, then improve the phrases that need help.

## Review the result by hand

Optimization gives suggestions, not final judgment. Your hands still matter. Try the phrase slowly and check whether the new position actually feels better.

If the optimized version makes a later chord harder, adjust it. A good tab is judged in context, not note by note.

## Combine optimization with section editing

Fingering is easier to judge inside clear sections. If the song is long, split it into parts first, then optimize the difficult phrases.

This is why Generate Cuts and editor sections are useful. Structure first. Fingerings second.

## FAQ

## What is a guitar fingering optimizer?

It is a tool or workflow that helps choose better string and fret positions for notes in a guitar tab. The goal is better playability.

## Can optimization fix every tab?

No. It can reduce awkward choices, but it cannot make every difficult song easy. You still need to review the result as a guitarist.

## Is fingering optimization useful for AI tabs?

Yes. AI-generated tabs often need better string choices. Optimization helps turn a rough draft into something more natural to play.

## Final thought

A guitar fingering optimizer is valuable because it solves a real guitar problem: where should the same notes live on the neck? Use it inside the [editor](/editor), then trust your ear and hands to choose the final version.`,
  },
  {
    title: "ASCII Guitar Tab Editor: When Plain Text Tabs Are Still Useful",
    slug: "ascii-guitar-tab-editor",
    excerpt:
      "ASCII guitar tabs are still useful for sharing, saving, and quick practice notes. Learn when to use plain text tabs and when to edit visually first.",
    seoTitle: "ASCII Guitar Tab Editor | Create and Export Plain Text Tabs",
    seoDescription:
      "Learn when ASCII guitar tabs are useful, how to create cleaner plain text tabs, and why visual editing before export improves playability.",
    tags: ["guitar-tab-editor", "tab-editor", "online-guitar-tab-editor"],
    cluster: "guitar-tab-editor",
    content: `Short answer: ASCII guitar tabs are useful when you need a simple plain text version of a riff, exercise, or song section. They are easy to copy, save, and share, but they work best after you have already cleaned up the tab in an editor.

If you want to create a playable version first, use the [Guitar Editor Canvas](/editor), then export or save the tab when it is ready.

## What ASCII guitar tab is good for

ASCII tab is the classic text-based format with six lines for guitar strings and fret numbers placed across them. It is simple, portable, and readable almost anywhere.

It works well for:

- quick riffs
- lesson notes
- forum posts
- practice reminders
- simple song sections
- sharing ideas in plain text

The strength is convenience.

## Where ASCII tab struggles

Plain text tabs can become hard to manage when the music gets complex. Timing, chord shapes, and long arrangements can be difficult to read if the spacing is messy.

That is why it often helps to edit visually first. Use playback and fingering tools to make the tab playable, then export the plain text version after the structure is clear.

## Clean up before exporting

Before turning a tab into ASCII, check the musical decisions:

- Are the repeated phrases consistent?
- Are the fingerings comfortable?
- Are the sections clear?
- Are chord shapes realistic?
- Does playback sound close enough?

If the tab is messy before export, the ASCII version will be messy too.

## Use ASCII for portability

ASCII is useful because it is not locked to one app. You can paste it into notes, messages, documents, or practice plans. It is also easy to archive.

For many players, the best workflow is visual editing plus ASCII export: use the editor for decisions, then keep a plain text version for reference.

## FAQ

## What is an ASCII guitar tab editor?

It is a tool or workflow for creating guitar tabs in plain text format. Some editors let you build the tab visually and then export an ASCII version.

## Are ASCII tabs still worth using?

Yes, especially for simple riffs, quick sharing, and practice notes. For complex editing, a visual editor with playback is usually easier.

## Should I write ASCII tabs by hand?

You can, but visual editing first is often faster if you need to check playback, change fingerings, or organize sections.

## Final thought

ASCII guitar tab is still useful because it is simple and portable. Use the [editor](/editor) to make the tab playable first, then keep the plain text version for sharing or practice.`,
  },
];

const TAGS = {
  "audio-to-tabs": "Audio to Tabs",
  "ai-guitar-tabs": "AI Guitar Tabs",
  "guitar-tab-editor": "Guitar Tab Editor",
  "tab-editor": "Tab Editor",
  "online-guitar-tab-editor": "Online Guitar Tab Editor",
};

const CLUSTERS = {
  "audio-to-guitar-tabs": {
    name: "Audio to Guitar Tabs",
    description: "Content about converting audio, MP3, WAV, and video sources into editable guitar tabs.",
  },
  "guitar-tab-editor": {
    name: "Guitar Tab Editor",
    description: "Content about editing guitar tabs, improving playability, and shaping better arrangements.",
  },
};

async function upsertTaxonomy() {
  const category = await prisma.category.upsert({
    where: { slug: "guitar-tabs" },
    update: { name: "Guitar Tabs", description: "Guides for creating, editing, and improving guitar tabs." },
    create: {
      name: "Guitar Tabs",
      slug: "guitar-tabs",
      description: "Guides for creating, editing, and improving guitar tabs.",
    },
  });

  const tagBySlug = {};
  for (const [slug, name] of Object.entries(TAGS)) {
    const tag = await prisma.tag.upsert({
      where: { slug },
      update: { name },
      create: { name, slug },
    });
    tagBySlug[slug] = tag.id;
  }

  const clusterBySlug = {};
  for (const [slug, row] of Object.entries(CLUSTERS)) {
    const cluster = await prisma.topicCluster.upsert({
      where: { slug },
      update: row,
      create: { ...row, slug },
    });
    clusterBySlug[slug] = cluster.id;
  }

  return { categoryId: category.id, tagBySlug, clusterBySlug };
}

async function getAuthorId() {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (admin?.id) return admin.id;

  const fallbackUser = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (fallbackUser?.id) return fallbackUser.id;

  throw new Error("No user found to assign as blog post author.");
}

async function upsertPost(post, authorId, taxonomy) {
  const existing = await prisma.post.findUnique({
    where: { slug: post.slug },
    select: { id: true, publishedAt: true },
  });

  const now = new Date();
  const tagIds = post.tags.map((slug) => taxonomy.tagBySlug[slug]).filter(Boolean);
  const clusterId = taxonomy.clusterBySlug[post.cluster];

  const data = {
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    contentHtml: null,
    contentToc: undefined,
    contentMode: "PLAIN",
    status: "PUBLISHED",
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    authorId,
    categories: {
      create: [{ categoryId: taxonomy.categoryId }],
    },
    tags: {
      create: tagIds.map((tagId) => ({ tagId })),
    },
    clusters: {
      create: clusterId ? [{ clusterId, isPillar: false }] : [],
    },
  };

  if (!existing) {
    await prisma.post.create({
      data: {
        ...data,
        slug: post.slug,
        publishAt: now,
        publishedAt: now,
      },
    });
    return "created";
  }

  await prisma.$transaction(async (tx) => {
    await tx.postCategory.deleteMany({ where: { postId: existing.id } });
    await tx.postTag.deleteMany({ where: { postId: existing.id } });
    await tx.postCluster.deleteMany({ where: { postId: existing.id } });
    await tx.post.update({
      where: { id: existing.id },
      data: {
        ...data,
        publishAt: existing.publishedAt || now,
        publishedAt: existing.publishedAt || now,
      },
    });
  });

  return "updated";
}

async function main() {
  const authorId = await getAuthorId();
  const taxonomy = await upsertTaxonomy();
  const results = [];

  for (const post of POSTS) {
    results.push(`${await upsertPost(post, authorId, taxonomy)}: ${post.slug}`);
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
