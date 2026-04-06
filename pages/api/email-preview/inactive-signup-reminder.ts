import type { NextApiRequest, NextApiResponse } from "next";
import { buildInactiveSignupReminderEmail } from "../../../lib/inactiveSignupReminder";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const name =
    typeof req.query.name === "string" && req.query.name.trim()
      ? req.query.name.trim()
      : "Aida";
  const email = buildInactiveSignupReminderEmail({ name });

  const previewHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${email.subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#e2e8f0;">
    ${email.html}
  </body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(previewHtml);
}
