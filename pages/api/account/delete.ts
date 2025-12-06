import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", ["DELETE"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    await prisma.tabJob.deleteMany({ where: { userId: session.user.id } });
    await prisma.account.deleteMany({ where: { userId: session.user.id } });
    await prisma.session.deleteMany({ where: { userId: session.user.id } });
    await prisma.user.delete({ where: { id: session.user.id } });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("delete account error", error);
    return res.status(500).json({ error: "Could not delete account." });
  }
}
