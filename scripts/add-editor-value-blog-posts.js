const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const POSTS = [
  {
    title: "How to Write Guitar Tabs Online Without Downloading Software",
    slug: "how-to-write-guitar-tabs-online-without-downloading-software",
    excerpt:
      "A practical workflow for writing guitar tabs online, checking them with playback, improving fingerings, and saving a version you can practice later.",
    seoTitle: "How to Write Guitar Tabs Online | No Download Workflow",
    seoDescription:
      "Learn how to write guitar tabs online with a browser-based editor, playback, fingering cleanup, section editing, and export-friendly tab workflows.",
    content: `Short answer: the easiest way to write guitar tabs online is to start with a small riff, place the notes in a browser-based editor, listen back with playback, then clean up fingerings before you save or export. You do not need desktop notation software to turn an idea into a usable practice tab.

If you want to try the workflow while reading, open the [online guitar tab editor](/online-guitar-tab-editor) or start from the [Guitar Editor Canvas](/editor).

## Start with one musical idea

Do not begin by trying to write an entire song. Start with one riff, chord pattern, intro, verse, or solo phrase. A small section makes it easier to hear mistakes and fix them before they spread through the whole tab.

This is especially useful if you are new to writing tablature. You can focus on three questions:

- Which string should each note use?
- Does the rhythm feel close enough to practice?
- Can your fretting hand play the phrase comfortably?

Once the first section works, the rest of the song becomes easier to build.

## Use the editor like a guitar player, not a spreadsheet

A tab is not just a grid of numbers. It is a set of playing decisions. The same pitch can often be played on several strings, and the first position you choose is not always the best one.

When you write guitar tabs online, use the editor to test choices quickly. Move a note to a nearby string. Try a different fret. Keep repeated phrases consistent. The goal is not only to make the tab technically correct; the goal is to make it playable.

## Check your work with playback

Playback is one of the fastest ways to catch problems. A tab might look reasonable but sound uneven, too crowded, or rhythmically wrong. Listening back helps you find those issues before you spend time polishing details.

Use playback after each important edit:

1. Write or import a short section.
2. Listen back once without changing anything.
3. Fix the notes that sound obviously wrong.
4. Listen again and check whether the phrase feels playable.

This loop is faster than guessing from the page alone.

## Keep fingerings close when possible

Most beginner tabs become harder than they need to be because the notes jump around the neck. If a phrase can stay in one hand position, it is usually easier to learn.

Look for unnecessary shifts. If one note forces your hand to leap up the neck and immediately come back, try moving that note to another string. The pitch can stay the same while the tab becomes much easier to play.

This is where a dedicated guitar tab editor helps more than a plain text document. You can test multiple positions without rewriting the whole line.

## Use sections before you write the full song

Long tabs need structure. Split the song into useful sections such as intro, verse, chorus, bridge, riff, or solo. Even if you do not label every part, separating the music into workable chunks makes editing easier.

In Note2Tabs, section and cut tools are useful when a tab starts to feel too long to manage. You can create smaller regions, clean them up one at a time, and avoid losing your place.

## Save the version you would actually practice

The best tab is not always the most complex one. It is the version you can return to and use. Before saving, ask:

- Can I play the hardest phrase at a slow tempo?
- Are repeated sections written consistently?
- Are the chord shapes realistic?
- Would I understand this tab tomorrow?

If the answer is yes, save that version. You can always improve it later.

## When to start from audio instead

Sometimes you do not want to write from a blank page. If you are trying to learn a song from a recording, start with the [AI guitar tab generator](/ai-guitar-tab-generator) or [YouTube to guitar tabs](/youtube-to-guitar-tabs) workflow, then open the draft in the editor.

That gives you a starting point. The editor is where you make the draft cleaner, more consistent, and easier to play.

## FAQ

## Can I write guitar tabs online for free?

Yes. You can use a browser-based tab editor to write and edit guitar tabs without downloading desktop software. Some tools may limit saving, export, or advanced features, so check the workflow before you commit a long arrangement.

## Is an online guitar tab editor better than plain text?

For quick ASCII notes, plain text can work. For playable guitar tabs, an editor is usually better because you can use playback, move notes, test fingerings, organize sections, and save the result more reliably.

## What should I write first in a new tab?

Start with the most recognizable riff or section. If that part feels good, build outward from there. Writing the hook first also helps you decide the best hand position for the rest of the arrangement.

## Final thought

Writing tabs online works best when you treat the editor as a practice tool. Write a small section, listen back, improve the fingering, and save the version that helps you play better.

When you are ready, open the [Guitar Editor Canvas](/editor) and turn one riff into a tab you can actually use.`,
  },
  {
    title: "Guitar Tab Maker vs Guitar Tab Editor: Which One Do You Need?",
    slug: "guitar-tab-maker-vs-guitar-tab-editor",
    excerpt:
      "Understand the difference between a guitar tab maker and a guitar tab editor so you can choose the right workflow for writing, fixing, or practicing tabs.",
    seoTitle: "Guitar Tab Maker vs Guitar Tab Editor | Which Tool to Use",
    seoDescription:
      "Compare guitar tab makers and guitar tab editors, including when to write from scratch, edit AI drafts, use playback, save tabs, and export playable results.",
    content: `Short answer: use a guitar tab maker when you want to create a tab from scratch. Use a guitar tab editor when you need to improve, clean up, organize, or practice a tab that already exists. Many players need both, especially when they start from an AI-generated draft.

If your goal is to create and refine playable tabs in one workflow, start with the [Guitar Editor Canvas](/editor).

## What a guitar tab maker does

A guitar tab maker is usually focused on creation. It gives you a place to enter fret numbers, build riffs, add chord shapes, and turn an idea into a readable tab.

That is useful when:

- you are writing an original riff
- you are making a lesson for a student
- you already know the notes you want
- you need a quick way to document an idea

The main question is: can you get the music onto the page quickly?

## What a guitar tab editor does

A guitar tab editor is focused on revision. It helps you take an existing tab and make it better.

That existing tab might be something you wrote yourself, a draft from an AI transcription, a tab imported from another workflow, or a rough arrangement you saved earlier.

The editor answers a different set of questions:

- Is this fingering comfortable?
- Does this phrase need a better string choice?
- Should this chord be voiced differently?
- Are the sections organized clearly?
- Can I hear the result before I practice it?

That is why editing matters. A tab can be readable and still be hard to play.

## Why the difference matters

Many guitarists search for a tab maker when they actually need an editor. The problem is not always getting numbers onto strings. The harder problem is making those numbers useful.

For example, an AI-generated tab might identify the right pitches but choose awkward positions. A basic maker will let you rewrite the tab manually. A stronger editor helps you test alternatives, use playback, save progress, and improve the draft without starting over.

## Use a tab maker when the idea is already in your hands

If you can already play the riff, a tab maker is enough for the first pass. You are simply writing down what your hands know.

This is common for:

- songwriting sketches
- practice exercises
- lesson examples
- short riffs
- simple chord patterns

In that case, speed matters. You want a clean place to capture the idea before you forget it.

## Use a tab editor when the tab needs decisions

If the tab needs musical judgment, use an editor. This is the better choice when a phrase feels awkward, the rhythm needs checking, or the notes came from a generated draft.

An editor is also better for longer songs because you need structure. Sections, cuts, playback, and saves become more important as the arrangement grows.

## The best workflow combines both

In practice, the best workflow is not maker versus editor. It is maker plus editor:

1. Create or generate the first draft.
2. Play it back.
3. Fix wrong or uncomfortable notes.
4. Organize the song into sections.
5. Save or export the playable version.

Note2Tabs is built around that workflow. You can start from audio with the [transcriber](/transcriber), then use the editor to make the result more playable.

## What to look for before choosing a tool

Before you choose a guitar tab tool, check whether it supports the job you actually need.

For writing from scratch, look for:

- fast note entry
- a clean editing surface
- simple saving
- readable output

For editing and practice, look for:

- playback
- alternate fingering control
- chord editing
- section or cut tools
- export or save options

If you care about both creation and cleanup, choose the workflow that handles both.

## FAQ

## Is a guitar tab maker the same as a guitar tab editor?

Not exactly. A tab maker helps you create a new tab. A tab editor helps you change, improve, and organize a tab after it exists. Some tools do both.

## Do I need an editor if I use AI to generate tabs?

Yes, if you want the result to be playable. AI can create a useful draft, but guitar fingering and section cleanup still need human judgment.

## What is the best tool for beginners?

Beginners should use the tool that makes mistakes easy to hear and fix. Playback, simple editing, and clear saving are usually more important than advanced notation features at the start.

## Final thought

A tab maker helps you start. A tab editor helps you finish.

If you want to write, clean up, and practice tabs in one place, try the [online guitar tab editor](/online-guitar-tab-editor) and use it to turn rough ideas into playable guitar parts.`,
  },
  {
    title: "How to Edit Guitar Tabs for Practice: A Simple Playability Checklist",
    slug: "how-to-edit-guitar-tabs-for-practice",
    excerpt:
      "Use this playability checklist to edit guitar tabs for practice: fix awkward jumps, check playback, simplify sections, and save a cleaner version.",
    seoTitle: "How to Edit Guitar Tabs for Practice | Playability Checklist",
    seoDescription:
      "Edit guitar tabs for better practice with a simple checklist for fingerings, playback, repeated phrases, chord shapes, sections, saves, and exports.",
    content: `Short answer: edit guitar tabs for practice by fixing the parts that stop you from playing them. Check the worst fingerings first, listen with playback, keep repeated phrases consistent, simplify unrealistic chord shapes, and save the clean version before you move on.

If you already have a rough tab, open it in the [Guitar Editor Canvas](/editor) and use this checklist while you edit.

## 1. Find the section that breaks your practice

Do not polish the easy parts first. Start with the section that makes you stop playing.

That might be:

- a fast run with awkward string changes
- a chord shape that feels too stretched
- a rhythm that does not line up with what you hear
- a transition between two phrases
- a generated section that looks too crowded

Fixing the worst section usually makes the whole tab more useful.

## 2. Listen before you rewrite

Before changing notes, listen to the tab. Playback helps you separate two different problems: notes that sound wrong and fingerings that feel wrong.

If the notes sound wrong, fix pitch or rhythm first. If the notes sound right but the phrase feels bad under your fingers, focus on fingering and position.

This prevents unnecessary rewriting.

## 3. Keep repeated phrases consistent

Repeated riffs should usually use the same fingering unless there is a musical reason to change. If the same phrase appears in three places with three different positions, the tab becomes harder to memorize.

Use the editor to compare repeated sections. Make the fingering consistent so your hands can learn the pattern once and reuse it.

## 4. Reduce unnecessary position jumps

A tab often becomes difficult because it jumps between positions too often. Look for notes that force your hand to move far away and immediately come back.

Ask whether the same pitch can be played closer to the surrounding notes. If yes, move it. Small fingering decisions like this can make a tab feel much more natural.

## 5. Simplify chord shapes that do not fit the tempo

Some chord shapes look correct but are unrealistic at speed. If a chord forces a huge stretch or a clumsy transition, try a different voicing.

A playable tab should respect the tempo of the song. A shape that works slowly may fail inside the actual phrase.

## 6. Use sections to practice smarter

Long tabs are easier to practice when they are divided into sections. Use cuts or section boundaries to separate the intro, verse, chorus, bridge, solo, or repeated riff.

This helps you loop the hard part mentally, even if you are not using a loop feature. It also makes the tab easier to understand when you return later.

## 7. Save before experimenting

Before making a big change, save the version that already works. Then experiment.

This is important because editing is exploratory. You might try a different fingering and decide the old version was better. Saving gives you a clean checkpoint.

## 8. Export only after the practice version works

Export is most useful after the tab has passed the playability test. If you export too early, you may end up practicing from a messy draft.

Before export, ask:

- Can I play the main riff slowly?
- Are the repeated phrases consistent?
- Are the chord shapes realistic?
- Can I understand the song structure?
- Would this tab help me practice tomorrow?

If yes, export or save the tab.

## A practical editing order

Use this order when you are cleaning up a rough tab:

1. Listen through once.
2. Mark the hardest section.
3. Fix notes that sound wrong.
4. Improve fingerings that feel awkward.
5. Clean up repeated phrases.
6. Simplify difficult chord shapes.
7. Organize sections.
8. Save or export the playable version.

That keeps you focused on value instead of endless tweaking.

## FAQ

## What makes a guitar tab playable?

A playable tab uses fingerings, chord shapes, and section structure that make sense on the guitar. It should be possible to practice the part without fighting unnecessary jumps or unclear phrasing.

## Should I edit every note in an AI-generated tab?

No. Start with the sections that sound wrong or feel hard to play. Many generated notes may be close enough for practice after you fix the most important phrases.

## When should I export a tab?

Export after the tab is useful for practice. If the tab still has awkward fingerings or unclear sections, keep editing before you turn it into a final version.

## Final thought

The best practice tab is not the most complicated version. It is the version that helps you play better tomorrow.

Use the [Guitar Editor Canvas](/editor) to clean up the tab, save the version that works, and return to it when you are ready to practice again.`,
  },
];

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

  const tags = await Promise.all([
    prisma.tag.upsert({
      where: { slug: "guitar-tab-editor" },
      update: { name: "Guitar Tab Editor" },
      create: { name: "Guitar Tab Editor", slug: "guitar-tab-editor" },
    }),
    prisma.tag.upsert({
      where: { slug: "tab-editor" },
      update: { name: "Tab Editor" },
      create: { name: "Tab Editor", slug: "tab-editor" },
    }),
    prisma.tag.upsert({
      where: { slug: "online-guitar-tab-editor" },
      update: { name: "Online Guitar Tab Editor" },
      create: { name: "Online Guitar Tab Editor", slug: "online-guitar-tab-editor" },
    }),
  ]);

  const cluster = await prisma.topicCluster.upsert({
    where: { slug: "guitar-tab-editor" },
    update: {
      name: "Guitar Tab Editor",
      description: "Content about editing guitar tabs, improving playability, and shaping better arrangements.",
    },
    create: {
      name: "Guitar Tab Editor",
      slug: "guitar-tab-editor",
      description: "Content about editing guitar tabs, improving playability, and shaping better arrangements.",
    },
  });

  return {
    categoryId: category.id,
    tagIds: tags.map((tag) => tag.id),
    clusterId: cluster.id,
  };
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

  if (!existing) {
    await prisma.post.create({
      data: {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content: post.content,
        contentMode: "PLAIN",
        status: "PUBLISHED",
        publishAt: now,
        publishedAt: now,
        seoTitle: post.seoTitle,
        seoDescription: post.seoDescription,
        authorId,
        categories: {
          create: [{ categoryId: taxonomy.categoryId }],
        },
        tags: {
          create: taxonomy.tagIds.map((tagId) => ({ tagId })),
        },
        clusters: {
          create: [{ clusterId: taxonomy.clusterId, isPillar: false }],
        },
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
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        contentMode: "PLAIN",
        status: "PUBLISHED",
        publishAt: existing.publishedAt || now,
        publishedAt: existing.publishedAt || now,
        seoTitle: post.seoTitle,
        seoDescription: post.seoDescription,
        authorId,
        categories: {
          create: [{ categoryId: taxonomy.categoryId }],
        },
        tags: {
          create: taxonomy.tagIds.map((tagId) => ({ tagId })),
        },
        clusters: {
          create: [{ clusterId: taxonomy.clusterId, isPillar: false }],
        },
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
    const state = await upsertPost(post, authorId, taxonomy);
    results.push(`${state}: ${post.slug}`);
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
