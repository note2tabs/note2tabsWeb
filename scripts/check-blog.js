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

  if (missingSeo.length > 0) {
    console.error("Published posts missing SEO fields:");
    missingSeo.forEach((post) => {
      console.error(`- ${post.title} (${post.slug})`);
    });
    process.exitCode = 1;
  }

  if (!duplicates.length && !missingSeo.length) {
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
