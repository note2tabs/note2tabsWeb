import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";

function parseCookies(req: NextApiRequest): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, decodeURIComponent(v.join("="))];
    })
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const cookies = parseCookies(req);
    const sessionId = cookies.analytics_session || (req.body?.sessionId as string | undefined);
    const { fingerprintId } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ error: "Missing session id" });
    }

    const session = await getServerSession(req, res, authOptions);
    const userId = session?.user?.id;

    await prisma.userConsent.upsert({
      where: userId ? { userId } : { id: sessionId },
      update: {
        granted: true,
        sessionId,
        fingerprintId: fingerprintId || undefined,
        userId: userId || undefined,
      },
      create: {
        granted: true,
        sessionId,
        fingerprintId: fingerprintId || undefined,
        userId: userId || undefined,
      },
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("consent grant error", error);
    return res.status(500).json({ error: "Could not save consent" });
  }
}
