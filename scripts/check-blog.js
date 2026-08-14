const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const duplicates = await prisma.post.groupBy({
    by: ["slug"],
    _count: { slug: true },
    having: { slug: { _count: { gt: 1 } } },
  });

  if (duplicates.length > 0) {
    console.error("Duplicate slugs found:");
    duplicates.forEach((dup) => {
      console.error(`- ${dup.slug} (${dup._count.slug})`);
    });
    process.exitCode = 1;
  }

  const missingSeo = await prisma.post.findMany({
    where: {
      status: "PUBLISHED",
      OR: [{ seoTitle: null }, { seoDescription: null }],
    },
    select: { id: true, title: true, slug: true },
  });

  const publishedContent = await prisma.post.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true, content: true },
  });
  const repeatedSections = publishedContent.flatMap((post) => {
    const headings = [...post.content.matchAll(/^##\s+(.+)$/gm)].map((match) =>
      match[1].trim().toLowerCase()
    );
    const duplicates = [...new Set(headings.filter((heading, index) =>
      headings.indexOf(heading) !== index
    ))];
    return duplicates.map((heading) => ({ slug: post.slug, heading }));
  });

  if (repeatedSections.length > 0) {
    console.error("Published posts with repeated sections:");
    repeatedSections.forEach(({ slug, heading }) => {
      console.error(`- ${slug}: ${heading}`);
    });
    process.exitCode = 1;
  }

  if (missingSeo.length > 0) {
    console.error("Published posts missing SEO fields:");
    missingSeo.forEach((post) => {
      console.error(`- ${post.title} (${post.slug})`);
    });
    process.exitCode = 1;
  }

  if (!duplicates.length && !missingSeo.length && !repeatedSections.length) {
    console.log("Blog checks passed.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
