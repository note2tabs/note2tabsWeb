import type { NextApiRequest, NextApiResponse } from "next";
import { buildTabReturnReminderEmail } from "../../../lib/tabReturnReminder";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (process.env.NODE_ENV === "production") return res.status(404).end();

  const email = buildTabReturnReminderEmail({
    name: typeof req.query.name === "string" ? req.query.name : "Noel",
    editorId: "preview-editor",
    editorName: typeof req.query.tab === "string" ? req.query.tab : "Autumn fall",
  });
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${email.subject}</title></head><body style="margin:0">${email.html}</body></html>`);
}
