import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(410).json({
    ok: false,
    error: "Analytics retention is managed in PostHog.",
  });
}

