import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";

const ALLOWED_ROLES = ["FREE", "PREMIUM", "MODERATOR", "ADMIN"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    const currentRole = session?.user?.role || "";
    if (!session?.user?.id || currentRole !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { id, role } = req.body || {};
    if (!id || typeof id !== "string" || !ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    await prisma.user.update({
      where: { id },
      data: { role },
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("update-role error", error);
    return res.status(500).json({ error: "Could not update role" });
  }
}
