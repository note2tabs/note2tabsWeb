import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { prisma } from "../../../lib/prisma";
import { authOptions } from "../auth/[...nextauth]";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Sign in to save tutorial progress." });
  }

  await prisma.user.updateMany({
    where: { id: session.user.id, passedTutorial: false },
    data: { passedTutorial: true },
  });
  return res.status(200).json({ ok: true, passedTutorial: true });
}
