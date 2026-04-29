import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { prisma } from "../../lib/prisma";
import {
  buildCreditsSummary,
  buildDevCreditsSummary,
  calculateCreditsUsedFromDurationCounts,
  getCreditWindow,
  reconcileCreditsWithStoredBalance,
  type CreditsSummary,
} from "../../lib/credits";
import {
  buildBackendCreditHeaders,
  raiseBackendCreditsToFloor,
  withBackendRemainingCredits,
} from "../../lib/backendCredits";
import { isLocalNoDbServerMode } from "../../lib/serverDevMode";

const isPremiumRole = (role?: string) =>
  role === "PREMIUM" || role === "ADMIN" || role === "MODERATOR" || role === "MOD";

async function buildUserCredits(user: {
  id: string;
  role: string;
  tokensRemaining: number;
  createdAt: Date;
}) {
  const isPremium = isPremiumRole(user.role);
  const creditWindow = isPremium
    ? getCreditWindow({ userCreatedAt: user.createdAt })
    : getCreditWindow();
  const creditDurationCounts = await prisma.tabJob.groupBy({
    by: ["durationSec"],
    where: isPremium
      ? { userId: user.id }
      : {
          userId: user.id,
          createdAt: {
            gte: creditWindow.start,
            lt: creditWindow.resetAt,
          },
        },
    _count: { _all: true },
  });
  const computedCredits = buildCreditsSummary({
    usedCredits: calculateCreditsUsedFromDurationCounts(
      creditDurationCounts.map((item) => ({
        durationSec: item.durationSec,
        count: item._count._all,
      }))
    ),
    resetAt: creditWindow.resetAt,
    isPremium,
    userCreatedAt: user.createdAt,
  });

  let credits: CreditsSummary = isPremium
    ? reconcileCreditsWithStoredBalance(computedCredits, user.tokensRemaining)
    : computedCredits;
  let source: "computed" | "stored" | "backend" = isPremium ? "stored" : "computed";

  if (isPremium) {
    try {
      const backendRemaining = await raiseBackendCreditsToFloor(
        user.id,
        computedCredits.remaining,
        buildBackendCreditHeaders(user.id)
      );
      if (typeof backendRemaining === "number") {
        credits = withBackendRemainingCredits(computedCredits, backendRemaining);
        source = "backend";
        if (user.tokensRemaining !== credits.remaining) {
          await prisma.user.update({
            where: { id: user.id },
            data: { tokensRemaining: credits.remaining },
          });
        }
      }
    } catch (error) {
      console.warn("credits backend read failed", error);
    }
  } else if (user.tokensRemaining !== credits.remaining) {
    await prisma.user.update({
      where: { id: user.id },
      data: { tokensRemaining: credits.remaining },
    });
  }

  return { credits, source };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (isLocalNoDbServerMode) {
    return res.status(200).json({ credits: buildDevCreditsSummary(), source: "dev" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      role: true,
      tokensRemaining: true,
      createdAt: true,
    },
  });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const result = await buildUserCredits(user);
  return res.status(200).json(result);
}
