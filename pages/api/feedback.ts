import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { ingestAnalyticsEvents } from "../../lib/analyticsV2/ingest";

const FEEDBACK_MAX_LENGTH = 2000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  const accountId = session?.user?.id || null;
  if (!accountId) {
    return res.status(401).json({ error: "Login required" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "general";
  const pagePath = typeof body.pagePath === "string" ? body.pagePath.trim() : "/feedback";

  if (!message) {
    return res.status(400).json({ error: "Feedback message is required." });
  }
  if (message.length > FEEDBACK_MAX_LENGTH) {
    return res.status(400).json({ error: `Feedback must be ${FEEDBACK_MAX_LENGTH} characters or less.` });
  }

  try {
    await ingestAnalyticsEvents({
      req,
      res,
      accountId,
      source: "feedback_form",
      body: {
        name: "user_feedback_submitted",
        path: "/feedback",
        props: {
          message,
          category: category || "general",
          pagePath,
        },
      },
    });
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error("feedback submit error", error);
    return res.status(500).json({ error: error?.message || "Could not submit feedback." });
  }
}

