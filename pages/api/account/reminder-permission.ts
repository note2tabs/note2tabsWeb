import type {NextApiRequest, NextApiResponse} from "next";
import {getServerSession} from "next-auth/next";
import {authOptions} from "../auth/[...nextauth]";
import {prisma} from "../../../lib/prisma";
import {setReminderEmailPermission} from "../../../lib/engagement/emailPermission";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!["GET", "PUT"].includes(req.method || "")) {res.setHeader("Allow", "GET, PUT"); return res.status(405).end();}
  if (process.env.ENGAGEMENT_SIGNALS_ENABLED !== "true") return res.status(200).json({mode:"disabled"});
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).end();
  const accountId = session.user.id;
  try {
    if (req.method === "PUT") {
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return res.status(403).end();
      if (typeof req.body?.allowed !== "boolean") return res.status(400).end();
      const user = await prisma.user.findUnique({where:{id:accountId}, select:{emailVerified:true,emailVerifiedBool:true}});
      if (!user) return res.status(401).end();
      if (req.body.allowed && !user.emailVerified && !user.emailVerifiedBool) return res.status(409).json({error:"verification_required"});
      await setReminderEmailPermission(accountId, req.body.allowed, "settings_explicit_v1");
    }
    const rows = await prisma.$queryRaw<Array<{allowed:boolean;basis:string;recordedAt:Date}>>`
      SELECT p.allowed, p.basis, p."recordedAt" FROM "EngagementEmailPermission" p WHERE p."accountId" = ${accountId}`;
    const suppression = await prisma.$queryRaw<Array<{present:boolean}>>`SELECT EXISTS (
      SELECT 1 FROM "VerificationToken" WHERE identifier IN (${`email:reminders-unsubscribed:${accountId}`}, ${`email:reminders-delivery-suppressed:${accountId}`}) AND expires > NOW()) AS present`;
    return res.status(200).json({mode:"active",allowed:rows[0]?.allowed === true && !suppression[0]?.present, recordedAt:rows[0]?.recordedAt || null});
  } catch {
    console.error("reminder_permission_unavailable");
    return res.status(503).json({error:"unavailable"});
  }
}
