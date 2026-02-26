import type { PrismaClient } from "@prisma/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../prisma";
import { parseRequestCookies, ANALYTICS_ANON_COOKIE, ANALYTICS_SESSION_COOKIE } from "./cookies";
import { hashFingerprint } from "./fingerprintHash";
import { analyticsFlags } from "./flags";

type IdentitySource = "signup" | "login";

type LinkIdentityInput = {
  userId: string;
  source: IdentitySource;
  req?: NextApiRequest;
  res?: NextApiResponse;
  rawFingerprint?: string;
  anonId?: string;
  sessionId?: string;
  prismaClient?: PrismaClient;
};

async function resolveFingerprintHash(
  prismaClient: PrismaClient,
  userId: string,
  anonId: string | undefined,
  rawFingerprint: string | undefined
): Promise<string | undefined> {
  const hashed = hashFingerprint(rawFingerprint);
  if (hashed) return hashed;

  const subjectByUser = await prismaClient.analyticsConsentSubject.findUnique({
    where: { userId },
    select: { fingerprintHash: true },
  });
  if (subjectByUser?.fingerprintHash) return subjectByUser.fingerprintHash;

  if (anonId) {
    const subjectByAnon = await prismaClient.analyticsConsentSubject.findUnique({
      where: { anonId },
      select: { fingerprintHash: true },
    });
    if (subjectByAnon?.fingerprintHash) return subjectByAnon.fingerprintHash;

    const recentEvent = await prismaClient.analyticsEventV2.findFirst({
      where: { anonId, fingerprintHash: { not: null } },
      orderBy: { ts: "desc" },
      select: { fingerprintHash: true },
    });
    if (recentEvent?.fingerprintHash) return recentEvent.fingerprintHash;
  }

  return undefined;
}

export async function linkIdentityToUser(input: LinkIdentityInput) {
  const prismaClient = input.prismaClient || prisma;
  const now = new Date();
  const linkDays = Math.max(1, analyticsFlags.fingerprintLinkDays);
  const expiresAt = new Date(now.getTime() + linkDays * 24 * 60 * 60 * 1000);
  const since = new Date(now.getTime() - linkDays * 24 * 60 * 60 * 1000);

  const cookies = input.req ? parseRequestCookies(input.req) : {};
  const anonId = input.anonId || cookies[ANALYTICS_ANON_COOKIE];
  const sessionId = input.sessionId || cookies[ANALYTICS_SESSION_COOKIE];
  const fingerprintHash = await resolveFingerprintHash(
    prismaClient,
    input.userId,
    anonId,
    input.rawFingerprint
  );

  if (anonId) {
    await prismaClient.analyticsIdentityLink.upsert({
      where: {
        userId_anonId: {
          userId: input.userId,
          anonId,
        },
      },
      update: {
        lastSeenAt: now,
        expiresAt,
        source: input.source,
      },
      create: {
        userId: input.userId,
        anonId,
        firstSeenAt: now,
        lastSeenAt: now,
        expiresAt,
        source: input.source,
      },
    });
  }

  if (fingerprintHash) {
    await prismaClient.analyticsIdentityLink.upsert({
      where: {
        userId_fingerprintHash: {
          userId: input.userId,
          fingerprintHash,
        },
      },
      update: {
        lastSeenAt: now,
        expiresAt,
        source: input.source,
      },
      create: {
        userId: input.userId,
        fingerprintHash,
        anonId: anonId || null,
        firstSeenAt: now,
        lastSeenAt: now,
        expiresAt,
        source: input.source,
      },
    });

    await prismaClient.analyticsEventV2.updateMany({
      where: {
        accountId: null,
        ts: { gte: since },
        fingerprintHash,
      },
      data: {
        accountId: input.userId,
      },
    });

    if (analyticsFlags.dualWrite) {
      await prismaClient.analyticsEvent.updateMany({
        where: {
          userId: null,
          createdAt: { gte: since },
          fingerprint: fingerprintHash,
        },
        data: {
          userId: input.userId,
        },
      });
    }
  }

  if (anonId) {
    await prismaClient.analyticsConsentSubject.updateMany({
      where: { anonId },
      data: {
        userId: input.userId,
        ...(fingerprintHash ? { fingerprintHash } : {}),
      },
    });
  } else {
    await prismaClient.analyticsConsentSubject.updateMany({
      where: { userId: input.userId },
      data: {
        ...(fingerprintHash ? { fingerprintHash } : {}),
      },
    });
  }

  return {
    ok: true,
    userId: input.userId,
    anonId: anonId || null,
    sessionId: sessionId || null,
    fingerprintHash: fingerprintHash || null,
    since,
    expiresAt,
  };
}
