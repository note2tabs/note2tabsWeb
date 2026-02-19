import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { isAdminSession } from "../../../../lib/admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!isAdminSession(session)) {
    return res.status(403).json({ error: "Admin access required." });
  }

  const slug = typeof req.query.slug === "string" ? req.query.slug : "";
  res.setPreviewData({ enabled: true }, { maxAge: 60 * 10 });
  const destination = slug ? `/blog/${slug}?preview=1` : "/blog";
  res.writeHead(307, { Location: destination });
  res.end();
}
