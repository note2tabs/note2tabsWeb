import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { prisma } from "../../../../../lib/prisma";
import { authOptions } from "../../../auth/[...nextauth]";
import { isAdminSession } from "../../../../../lib/admin";
import { rateLimit } from "../../../../../lib/rateLimit";
import { postInputSchema } from "../../../../../lib/blogValidators";
import { slugify } from "../../../../../lib/slug";
import { sendBlogApiError } from "../../../../../lib/blogApiError";
import { normalizeCanonicalUrl } from "../../../../../lib/canonical";

const PAGE_SIZE = 20;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!rateLimit(req, res, { id: "admin-blog-posts", limit: 60, windowMs: 60_000 })) {
      return;
    }
    const session = await getServerSession(req, res, authOptions);
    if (!isAdminSession(session)) {
      return res.status(403).json({ error: "Admin access required." });
    }
    const authorId = session?.user?.id;
    if (!authorId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (req.method === "GET") {
      const page = Math.max(1, Number(req.query.page || 1));
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const category = typeof req.query.category === "string" ? req.query.category : undefined;
      const tag = typeof req.query.tag === "string" ? req.query.tag : undefined;
      const cluster = typeof req.query.cluster === "string" ? req.query.cluster : undefined;

      const where: any = {};
      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" } },
          { excerpt: { contains: search, mode: "insensitive" } },
          { slug: { contains: search, mode: "insensitive" } },
        ];
      }
      if (status && ["DRAFT", "SCHEDULED", "PUBLISHED"].includes(status)) {
        where.status = status;
      }
      if (category) {
        where.categories = { some: { category: { slug: category } } };
      }
      if (tag) {
        where.tags = { some: { tag: { slug: tag } } };
      }
      if (cluster) {
        where.clusters = { some: { cluster: { slug: cluster } } };
      }

      const [total, posts] = await Promise.all([
        prisma.post.count({ where }),
        prisma.post.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          include: {
            author: { select: { id: true, name: true, email: true } },
            categories: { include: { category: true } },
            tags: { include: { tag: true } },
            clusters: { include: { cluster: true } },
          },
        }),
      ]);

      return res.status(200).json({
        posts,
        page,
        pageSize: PAGE_SIZE,
        total,
      });
    }

    if (req.method === "POST") {
      const parsed = postInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid payload.",
          details: parsed.error.flatten(),
        });
      }
      const input = parsed.data;
      const slug = slugify(input.slug || input.title);
      const canonicalUrl = normalizeCanonicalUrl(input.canonicalUrl);

      const existing = await prisma.post.findUnique({ where: { slug } });
      if (existing) {
        return res.status(409).json({ error: "Slug already exists." });
      }

      const now = new Date();
      const publishAt = input.publishAt ? new Date(input.publishAt) : null;
      let publishedAt: Date | null = null;
      if (input.status === "PUBLISHED") {
        publishedAt = now;
      }
      if (input.status === "SCHEDULED" && !publishAt) {
        return res.status(400).json({ error: "Publish date required for scheduled posts." });
      }

      const categoryIds = input.categories || [];
      const tagIds = input.tags || [];
      const clusterInputs = input.clusters || [];

      const post = await prisma.$transaction(async (tx) => {
        const created = await tx.post.create({
          data: {
            title: input.title,
            slug,
            excerpt: input.excerpt,
            content: input.content,
            coverImageUrl: input.coverImageUrl || null,
            status: input.status,
            publishAt,
            publishedAt,
            seoTitle: input.seoTitle || null,
            seoDescription: input.seoDescription || null,
            canonicalUrl,
            authorId,
            categories: {
              create: categoryIds.map((categoryId) => ({ categoryId })),
            },
            tags: {
              create: tagIds.map((tagId) => ({ tagId })),
            },
            clusters: {
              create: clusterInputs.map((cluster) => ({
                clusterId: cluster.id,
                isPillar: Boolean(cluster.isPillar),
              })),
            },
          },
        });

        const pillarClusters = clusterInputs.filter((cluster) => cluster.isPillar);
        for (const pillar of pillarClusters) {
          await tx.postCluster.updateMany({
            where: {
              clusterId: pillar.id,
              postId: { not: created.id },
            },
            data: { isPillar: false },
          });
        }

        return created;
      });

      return res.status(201).json({ post });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    return sendBlogApiError(res, error, "Could not process post request.");
  }
}
