import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

const SUCCEEDED_MAX_AGE_HOURS = 48;
const FAILED_MAX_AGE_DAYS = 5;
// A job legitimately in "running" for under an hour is just mid-flight, not
// stuck -- only clear rows that have been stale long enough to rule that out.
const STUCK_RUNNING_MAX_AGE_HOURS = 24;

function authorized(req: NextApiRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.authorization === `Bearer ${secret}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized" });

  const succeededCutoff = new Date(Date.now() - SUCCEEDED_MAX_AGE_HOURS * 60 * 60 * 1000);
  const failedCutoff = new Date(Date.now() - FAILED_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const stuckRunningCutoff = new Date(Date.now() - STUCK_RUNNING_MAX_AGE_HOURS * 60 * 60 * 1000);

  const [succeededDeleted, failedDeleted, runningDeleted] = await Promise.all([
    prisma.jobs.deleteMany({
      where: { status: "succeeded", createdAt: { lt: succeededCutoff } },
    }),
    prisma.jobs.deleteMany({
      where: { status: "failed", createdAt: { lt: failedCutoff } },
    }),
    prisma.jobs.deleteMany({
      where: { status: "running", createdAt: { lt: stuckRunningCutoff } },
    }),
  ]);

  return res.status(200).json({
    succeededDeleted: succeededDeleted.count,
    failedDeleted: failedDeleted.count,
    runningDeleted: runningDeleted.count,
  });
}
