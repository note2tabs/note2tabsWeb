import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import crypto from "crypto";
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

function hashIp(ip?: string | null) {
  if (!ip) return undefined;
  const truncated = ip.split(",")[0]?.trim().split(":").slice(0, -1).join(":") || ip.split(",")[0]?.trim();
  return crypto.createHash("sha256").update(truncated).digest("hex");
}

function parseUA(ua: string | undefined) {
  const userAgent = ua || "";
  const lower = userAgent.toLowerCase();
  let deviceType = "desktop";
  if (lower.includes("mobile")) deviceType = "mobile";
  if (lower.includes("tablet")) deviceType = "tablet";
  let browser = "unknown";
  if (lower.includes("chrome")) browser = "chrome";
  else if (lower.includes("firefox")) browser = "firefox";
  else if (lower.includes("safari")) browser = "safari";
  else if (lower.includes("edg")) browser = "edge";
  let os = "unknown";
  if (lower.includes("windows")) os = "windows";
  else if (lower.includes("mac")) os = "macos";
  else if (lower.includes("linux")) os = "linux";
  else if (lower.includes("android")) os = "android";
  else if (lower.includes("iphone") || lower.includes("ios")) os = "ios";
  return { browser, os, deviceType, userAgent };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const cookies = parseCookies(req);
    if (cookies.analytics_consent !== "granted") {
      return res.status(200).json({ ok: false, reason: "no consent" });
    }

    const { event, path, referer, payload } = req.body || {};
    if (!event || typeof event !== "string") {
      return res.status(400).json({ error: "Invalid event" });
    }

    const sessionId = cookies.analytics_session;
    const session = await getServerSession(req, res, authOptions);
    const userId = session?.user?.id;

    let fingerprint: string | undefined;
    if (sessionId || userId) {
      const consent = await prisma.userConsent.findFirst({
        where: {
          OR: [
            sessionId ? { sessionId } : undefined,
            userId ? { userId } : undefined,
          ].filter(Boolean) as any,
        },
      });
      fingerprint = consent?.fingerprintId || undefined;
    }

    const ip = (req.headers["x-forwarded-for"] as string | undefined) || req.socket.remoteAddress;
    const ipHash = hashIp(ip);
    const ua = parseUA(req.headers["user-agent"]);

    await prisma.analyticsEvent.create({
      data: {
        userId,
        sessionId,
        fingerprint,
        event,
        path: typeof path === "string" ? path : undefined,
        referer: typeof referer === "string" ? referer : undefined,
        ipHash,
        browser: ua.browser,
        os: ua.os,
        deviceType: ua.deviceType,
        payload: payload ? JSON.stringify(payload) : undefined,
      },
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("analytics event error", error);
    return res.status(500).json({ error: "Could not record event" });
  }
}
