const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const slugify = (value, maxLength = 80) =>
  value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength) || "post";

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set.");
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN", passwordHash },
    create: {
      email: adminEmail,
      name: "Admin",
      role: "ADMIN",
      passwordHash,
    },
  });

  const category = await prisma.category.upsert({
    where: { slug: "guitar-tabs" },
    update: {},
    create: { name: "Guitar Tabs", slug: "guitar-tabs", description: "Tab creation workflows." },
  });

  const tag = await prisma.tag.upsert({
    where: { slug: "transcription" },
    update: {},
    create: { name: "Transcription", slug: "transcription" },
  });

  const cluster = await prisma.topicCluster.upsert({
    where: { slug: "guitar-tab-generation" },
    update: {},
    create: { name: "Guitar Tab Generation", slug: "guitar-tab-generation" },
  });

  const demoSlug = slugify("Welcome to Note2Tabs");
  const existing = await prisma.post.findUnique({ where: { slug: demoSlug } });
  if (!existing) {
    await prisma.post.create({
      data: {
        title: "Welcome to Note2Tabs",
        slug: demoSlug,
        excerpt: "Learn how to convert audio to guitar tabs and start editing in minutes.",
        content: "# Welcome to Note2Tabs\n\nStart by uploading audio or a YouTube link.",
        status: "PUBLISHED",
        publishAt: new Date(),
        publishedAt: new Date(),
        authorId: admin.id,
        categories: { create: [{ categoryId: category.id }] },
        tags: { create: [{ tagId: tag.id }] },
        clusters: { create: [{ clusterId: cluster.id, isPillar: true }] },
        seoTitle: "Welcome to Note2Tabs",
        seoDescription: "Learn how Note2Tabs converts audio into guitar tabs.",
      },
    });
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
