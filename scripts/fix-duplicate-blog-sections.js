const { Prisma, PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const TARGETS = [
  {
    slug: "manual-vs-ai-guitar-transcription-which-is-better-for-guitar-players",
    heading: "Quick decision rule",
  },
  {
    slug: "note-to-tab-converter-how-to-turn-guitar-notes-into-tablature-online",
    heading: "How this differs from audio-to-tab conversion",
  },
];

function removeRepeatedSection(content, heading) {
  const marker = `## ${heading}`;
  const positions = [];
  let cursor = 0;

  while ((cursor = content.indexOf(marker, cursor)) !== -1) {
    positions.push(cursor);
    cursor += marker.length;
  }
  if (positions.length < 2) return { content, removed: 0 };

  let result = content;
  for (let index = positions.length - 1; index >= 1; index -= 1) {
    const start = result.lastIndexOf(marker);
    const nextHeading = result.indexOf("\n## ", start + marker.length);
    const end = nextHeading === -1 ? result.length : nextHeading + 1;
    result = `${result.slice(0, start).trimEnd()}\n\n${result.slice(end).trimStart()}`;
  }

  return { content: result.trim(), removed: positions.length - 1 };
}

async function main() {
  const changes = [];

  for (const target of TARGETS) {
    const post = await prisma.post.findUnique({
      where: { slug: target.slug },
      select: { id: true, content: true },
    });
    if (!post) throw new Error(`Missing post: ${target.slug}`);

    const result = removeRepeatedSection(post.content, target.heading);
    changes.push({ ...target, ...result, id: post.id });
  }

  changes.forEach((change) => {
    console.log(`${change.slug}: ${change.removed} repeated section(s)`);
  });
  if (!APPLY || changes.every((change) => change.removed === 0)) return;

  await prisma.$transaction(
    changes
      .filter((change) => change.removed > 0)
      .map((change) =>
        prisma.post.update({
          where: { id: change.id },
          data: {
            content: change.content,
            contentHtml: null,
            contentToc: Prisma.JsonNull,
          },
        })
      )
  );
  console.log("Applied duplicate-section cleanup.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
