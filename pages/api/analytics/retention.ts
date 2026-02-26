import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";
import { analyticsFlags } from "../../../lib/analyticsV2/flags";

const bodySchema = z
  .object({
    rawDays: z.number().int().positive().optional(),
    rollupDays: z.number().int().positive().optional(),
  })
  .optional();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const parsed = bodySchema.parse(typeof req.body === "string" ? JSON.parse(req.body) : req.body || {});
    const rawDays = parsed?.rawDays || analyticsFlags.rawRetentionDays;
    const rollupDays = parsed?.rollupDays || analyticsFlags.rollupRetentionDays;

    const rawCutoff = new Date(Date.now() - rawDays * 24 * 60 * 60 * 1000);
    const rollupCutoff = new Date(Date.now() - rollupDays * 24 * 60 * 60 * 1000);

    const [rawResult, gteResult, rollupResult] = await Promise.all([
      prisma.analyticsEventV2.deleteMany({
        where: {
          ts: {
            lt: rawCutoff,
          },
        },
      }),
      prisma.analyticsGteSession.deleteMany({
        where: {
          startedAt: {
            lt: rawCutoff,
          },
        },
      }),
      prisma.analyticsDailyKpi.deleteMany({
        where: {
          day: {
            lt: rollupCutoff,
          },
        },
      }),
    ]);

    return res.status(200).json({
      ok: true,
      rawDays,
      rollupDays,
      rawCutoff: rawCutoff.toISOString(),
      rollupCutoff: rollupCutoff.toISOString(),
      deleted: {
        analyticsEventV2: rawResult.count,
        analyticsGteSession: gteResult.count,
        analyticsDailyKpi: rollupResult.count,
      },
    });
  } catch (error: any) {
    console.error("analytics retention error", error);
    return res.status(400).json({ error: error?.message || "Could not run retention cleanup" });
  }
}
