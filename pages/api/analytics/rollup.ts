import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";
import { analyticsFlags } from "../../../lib/analyticsV2/flags";

const bodySchema = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .optional();

function toDayStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dayKey(date: Date) {
  return toDayStart(date).toISOString().slice(0, 10);
}

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
    const to = parsed?.to ? new Date(parsed.to) : new Date();
    const from = parsed?.from
      ? new Date(parsed.from)
      : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

    const env = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";

    const [events, gteSessions] = await Promise.all([
      prisma.analyticsEventV2.findMany({
        where: {
          ts: { gte: from, lte: to },
          env,
        },
        select: {
          ts: true,
          name: true,
          anonId: true,
          sessionId: true,
        },
      }),
      prisma.analyticsGteSession.findMany({
        where: {
          startedAt: { gte: from, lte: to },
          env,
        },
        select: {
          startedAt: true,
          durationMs: true,
        },
      }),
    ]);

    const byDay = new Map<string, {
      visitors: Set<string>;
      pageviews: number;
      transcriptionStarted: number;
      transcriptionSucceeded: number;
      transcriptionFailed: number;
      gteSessions: number;
      gteDurationMs: number;
    }>();

    for (const event of events) {
      const key = dayKey(event.ts);
      if (!byDay.has(key)) {
        byDay.set(key, {
          visitors: new Set<string>(),
          pageviews: 0,
          transcriptionStarted: 0,
          transcriptionSucceeded: 0,
          transcriptionFailed: 0,
          gteSessions: 0,
          gteDurationMs: 0,
        });
      }
      const row = byDay.get(key)!;
      const visitorId = event.anonId || event.sessionId;
      if (visitorId) row.visitors.add(visitorId);
      if (event.name === "page_viewed") row.pageviews += 1;
      if (event.name === "transcription_started") row.transcriptionStarted += 1;
      if (event.name === "transcription_succeeded") row.transcriptionSucceeded += 1;
      if (event.name === "transcription_failed") row.transcriptionFailed += 1;
    }

    for (const sessionRow of gteSessions) {
      const key = dayKey(sessionRow.startedAt);
      if (!byDay.has(key)) {
        byDay.set(key, {
          visitors: new Set<string>(),
          pageviews: 0,
          transcriptionStarted: 0,
          transcriptionSucceeded: 0,
          transcriptionFailed: 0,
          gteSessions: 0,
          gteDurationMs: 0,
        });
      }
      const row = byDay.get(key)!;
      row.gteSessions += 1;
      row.gteDurationMs += Math.max(0, sessionRow.durationMs || 0);
    }

    const upserts = Array.from(byDay.entries()).map(([day, row]) =>
      prisma.analyticsDailyKpi.upsert({
        where: {
          day_env: {
            day: new Date(`${day}T00:00:00.000Z`),
            env,
          },
        },
        update: {
          metrics: {
            visitors: row.visitors.size,
            pageviews: row.pageviews,
            transcriptionStarted: row.transcriptionStarted,
            transcriptionSucceeded: row.transcriptionSucceeded,
            transcriptionFailed: row.transcriptionFailed,
            gteSessions: row.gteSessions,
            gteDurationMs: row.gteDurationMs,
          },
        },
        create: {
          day: new Date(`${day}T00:00:00.000Z`),
          env,
          metrics: {
            visitors: row.visitors.size,
            pageviews: row.pageviews,
            transcriptionStarted: row.transcriptionStarted,
            transcriptionSucceeded: row.transcriptionSucceeded,
            transcriptionFailed: row.transcriptionFailed,
            gteSessions: row.gteSessions,
            gteDurationMs: row.gteDurationMs,
          },
        },
      })
    );

    await prisma.$transaction(upserts);

    return res.status(200).json({
      ok: true,
      env,
      from: from.toISOString(),
      to: to.toISOString(),
      daysProcessed: byDay.size,
      retentionDefaults: {
        rawDays: analyticsFlags.rawRetentionDays,
        rollupDays: analyticsFlags.rollupRetentionDays,
      },
    });
  } catch (error: any) {
    console.error("analytics rollup error", error);
    return res.status(400).json({ error: error?.message || "Could not run rollup" });
  }
}
