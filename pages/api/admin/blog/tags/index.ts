import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { prisma } from "../../../../../lib/prisma";
import { authOptions } from "../../../auth/[...nextauth]";
import { isAdminSession } from "../../../../../lib/admin";
import { rateLimit } from "../../../../../lib/rateLimit";
import { taxonomyInputSchema } from "../../../../../lib/blogValidators";
import { slugify } from "../../../../../lib/slug";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!rateLimit(req, res, { id: "admin-blog-tags", limit: 60, windowMs: 60_000 })) {
    return;
  }
  const session = await getServerSession(req, res, authOptions);
  if (!isAdminSession(session)) {
    return res.status(403).json({ error: "Admin access required." });
  }

  if (req.method === "GET") {
    const tags = await prisma.tag.findMany({
      orderBy: { name: "asc" },
    });
    return res.status(200).json({ tags });
  }

  if (req.method === "POST") {
    const parsed = taxonomyInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload.", details: parsed.error.flatten() });
    }
    const slug = slugify(parsed.data.slug || parsed.data.name);
    const existing = await prisma.tag.findUnique({ where: { slug } });
    if (existing) {
      return res.status(409).json({ error: "Slug already exists." });
    }
    const tag = await prisma.tag.create({
      data: {
        name: parsed.data.name,
        slug,
      },
    });
    return res.status(201).json({ tag });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: "Method not allowed." });
}
