import type { NextApiRequest, NextApiResponse } from "next";

const YOUTUBE_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const videoId = typeof req.query.videoId === "string" ? req.query.videoId.trim() : "";
  if (!YOUTUBE_VIDEO_ID_RE.test(videoId)) {
    return res.status(400).json({ error: "Invalid videoId" });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ title: null });
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(
      videoId
    )}&part=snippet&key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(200).json({ title: null });
    }
    const data = (await response.json().catch(() => null)) as {
      items?: Array<{ snippet?: { title?: string } }>;
    } | null;
    const title = data?.items?.[0]?.snippet?.title;
    return res.status(200).json({ title: typeof title === "string" && title.trim() ? title.trim() : null });
  } catch (error) {
    console.warn("youtube-title lookup failed", error);
    return res.status(200).json({ title: null });
  }
}
