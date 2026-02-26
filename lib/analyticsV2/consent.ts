import { PrismaClient } from "@prisma/client";
import type { NextApiResponse } from "next";
import {
  ANALYTICS_ANON_COOKIE,
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_SESSION_COOKIE,
  clearAnalyticsIdentifierCookies,
  ensureTrackingCookies,
  setConsentCookie,
} from "./cookies";

export type AnalyticsConsentState = "granted" | "denied";

type EnsureConsentSubjectInput = {
  prismaClient: PrismaClient;
  state?: AnalyticsConsentState;
  userId?: string | null;
  anonId?: string | null;
  fingerprintHash?: string | null;
};

export async function ensureConsentSubject(input: EnsureConsentSubjectInput) {
  const { prismaClient, userId, anonId, fingerprintHash } = input;
  const state = input.state || "granted";

  let subject =
    (userId
      ? await prismaClient.analyticsConsentSubject.findUnique({
          where: { userId },
        })
      : null) ||
    (anonId
      ? await prismaClient.analyticsConsentSubject.findUnique({
          where: { anonId },
        })
      : null);

  if (!subject) {
    subject = await prismaClient.analyticsConsentSubject.create({
      data: {
        userId: userId || null,
        anonId: anonId || null,
        state,
        fingerprintHash: fingerprintHash || null,
      },
    });
    return subject;
  }

  const updates: {
    userId?: string | null;
    anonId?: string | null;
    state?: AnalyticsConsentState;
    fingerprintHash?: string | null;
  } = {};

  if (userId && subject.userId !== userId) updates.userId = userId;
  if (anonId && subject.anonId !== anonId) updates.anonId = anonId;
  if (subject.state !== state) updates.state = state;
  if (fingerprintHash && subject.fingerprintHash !== fingerprintHash) {
    updates.fingerprintHash = fingerprintHash;
  }

  if (Object.keys(updates).length > 0) {
    subject = await prismaClient.analyticsConsentSubject.update({
      where: { id: subject.id },
      data: updates,
    });
  }

  return subject;
}

type PersistConsentInput = {
  prismaClient: PrismaClient;
  res: NextApiResponse;
  cookies: Record<string, string>;
  state: AnalyticsConsentState;
  userId?: string | null;
  rawFingerprint?: string;
  fingerprintHash?: string;
  source: string;
};

export async function persistConsentState(input: PersistConsentInput) {
  const { prismaClient, res, cookies, state, userId, source } = input;
  const existingAnonId = cookies[ANALYTICS_ANON_COOKIE];
  const existingSessionId = cookies[ANALYTICS_SESSION_COOKIE];
  const ids = state === "granted" ? ensureTrackingCookies(res, cookies) : { anonId: existingAnonId, sessionId: existingSessionId };

  if (state === "denied") {
    clearAnalyticsIdentifierCookies(res);
  }
  setConsentCookie(res, state);

  const subject = await ensureConsentSubject({
    prismaClient,
    state,
    userId,
    anonId: ids.anonId || null,
    fingerprintHash: input.fingerprintHash || null,
  });

  await prismaClient.analyticsConsentAudit.create({
    data: {
      subjectId: subject.id,
      state,
      source,
      metadata: {
        userId: userId || null,
        sessionId: ids.sessionId || null,
        anonId: ids.anonId || null,
      },
    },
  });

  return {
    subject,
    cookies: {
      consent: state,
      sessionId: ids.sessionId || null,
      anonId: ids.anonId || null,
    },
  };
}

export function isConsentDenied(cookies: Record<string, string>) {
  return cookies[ANALYTICS_CONSENT_COOKIE] === "denied";
}
