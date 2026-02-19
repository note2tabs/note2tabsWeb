import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { prisma } from "../../../../../lib/prisma";
import { authOptions } from "../../../auth/[...nextauth]";
import { isAdminSession } from "../../../../../lib/admin";
import { rateLimit } from "../../../../../lib/rateLimit";
import { taxonomyInputSchema } from "../../../../../lib/blogValidators";
import { slugify } from "../../../../../lib/slug";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!rateLimit(req, res, { id: "admin-blog-cluster", limit: 60, windowMs: 60_000 })) {
    return;
  }
  const session = await getServerSession(req, res, authOptions);
  if (!isAdminSession(session)) {
    return res.status(403).json({ error: "Admin access required." });
  }

  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id) {
    return res.status(400).json({ error: "Missing cluster id." });
  }

  if (req.method === "PUT") {
    const parsed = taxonomyInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload.", details: parsed.error.flatten() });
    }
    const slug = slugify(parsed.data.slug || parsed.data.name);
    const existing = await prisma.topicCluster.findUnique({ where: { slug } });
    if (existing && existing.id !== id) {
      return res.status(409).json({ error: "Slug already exists." });
    }
    const cluster = await prisma.topicCluster.update({
      where: { id },
      data: {
        name: parsed.data.name,
        slug,
        description: parsed.data.description || null,
      },
    });
    return res.status(200).json({ cluster });
  }

  if (req.method === "DELETE") {
    await prisma.topicCluster.delete({ where: { id } });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", ["PUT", "DELETE"]);
  return res.status(405).json({ error: "Method not allowed." });
}
