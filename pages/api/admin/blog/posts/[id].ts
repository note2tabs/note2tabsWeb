import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { prisma } from "../../../../../lib/prisma";
import { authOptions } from "../../../auth/[...nextauth]";
import { isAdminSession } from "../../../../../lib/admin";
import { rateLimit } from "../../../../../lib/rateLimit";
import { postInputSchema } from "../../../../../lib/blogValidators";
import { slugify } from "../../../../../lib/slug";
import { sendBlogApiError } from "../../../../../lib/blogApiError";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!rateLimit(req, res, { id: "admin-blog-post", limit: 60, windowMs: 60_000 })) {
      return;
    }
    const session = await getServerSession(req, res, authOptions);
    if (!isAdminSession(session)) {
      return res.status(403).json({ error: "Admin access required." });
    }

    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    if (!id) {
      return res.status(400).json({ error: "Missing post id." });
    }

    if (req.method === "GET") {
      const post = await prisma.post.findUnique({
        where: { id },
        include: {
          author: { select: { id: true, name: true, email: true } },
          categories: { include: { category: true } },
          tags: { include: { tag: true } },
          clusters: { include: { cluster: true } },
        },
      });
      if (!post) {
        return res.status(404).json({ error: "Post not found." });
      }
      return res.status(200).json({ post });
    }

    if (req.method === "PUT") {
      const parsed = postInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload.", details: parsed.error.flatten() });
      }
      const input = parsed.data;
      const slug = slugify(input.slug || input.title);

      const existing = await prisma.post.findUnique({ where: { slug } });
      if (existing && existing.id !== id) {
        return res.status(409).json({ error: "Slug already exists." });
      }

      const existingPost = await prisma.post.findUnique({
        where: { id },
        select: { publishedAt: true },
      });
      const now = new Date();
      const publishAt = input.publishAt ? new Date(input.publishAt) : null;
      let publishedAt: Date | null = null;
      if (input.status === "PUBLISHED") {
        publishedAt = existingPost?.publishedAt || now;
      }
      if (input.status === "SCHEDULED" && !publishAt) {
        return res.status(400).json({ error: "Publish date required for scheduled posts." });
      }

      const categoryIds = input.categories || [];
      const tagIds = input.tags || [];
      const clusterInputs = input.clusters || [];

      const post = await prisma.$transaction(async (tx) => {
        await tx.postCategory.deleteMany({ where: { postId: id } });
        await tx.postTag.deleteMany({ where: { postId: id } });
        await tx.postCluster.deleteMany({ where: { postId: id } });

        const updated = await tx.post.update({
          where: { id },
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
            canonicalUrl: input.canonicalUrl || null,
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
              postId: { not: updated.id },
            },
            data: { isPillar: false },
          });
        }

        return updated;
      });

      return res.status(200).json({ post });
    }

    if (req.method === "DELETE") {
      await prisma.post.delete({ where: { id } });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    return sendBlogApiError(res, error, "Could not process post request.");
  }
}
