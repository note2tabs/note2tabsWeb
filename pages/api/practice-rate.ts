import fs from "node:fs/promises";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import {
  IncomingForm,
  type Fields,
  type File as FormidableFile,
  type Files,
} from "formidable";
import { authOptions } from "./auth/[...nextauth]";
import { getFreshUserRole } from "../../lib/serverAuth";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: "16mb",
  },
};

const API_BASE = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
const BACKEND_SECRET =
  process.env.BACKEND_SHARED_SECRET || process.env.NOTE2TABS_BACKEND_SECRET;

const firstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const firstFile = (
  value: FormidableFile | FormidableFile[] | undefined
): FormidableFile | undefined => (Array.isArray(value) ? value[0] : value);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: "Not authenticated" });
  const role = await getFreshUserRole(session);
  if (!role) return res.status(401).json({ error: "Account not found" });

  let parsed: [Fields, Files];
  try {
    parsed = await new IncomingForm({
      maxFiles: 1,
      maxFileSize: 14 * 1024 * 1024,
      allowEmptyFiles: false,
    }).parse(req);
  } catch {
    return res.status(400).json({ error: "The microphone recording could not be read." });
  }
  const [fields, files] = parsed;
  const audio = firstFile(files.audio);
  const bars = firstValue(fields.bars);
  const sampleRate = firstValue(fields.sample_rate);
  if (!audio || !bars || !sampleRate) {
    return res.status(400).json({ error: "Audio, bars, and sample rate are required." });
  }

  try {
    const audioBytes = await fs.readFile(audio.filepath);
    const backendUrl = `${API_BASE.replace(/\/$/, "")}/api/v1/practice/rate`;
    let backendResponse: Response | null = null;
    let lastRequestError: unknown = null;

    for (let attempt = 0; attempt < 2 && !backendResponse; attempt += 1) {
      const body = new FormData();
      body.set(
        "audio",
        new Blob([audioBytes], { type: audio.mimetype || "audio/wav" }),
        audio.originalFilename || "practice.wav"
      );
      body.set("bars", bars);
      body.set("sample_rate", sampleRate);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);
      try {
        backendResponse = await fetch(backendUrl, {
          method: "POST",
          headers: {
            ...(BACKEND_SECRET ? { "X-Backend-Secret": BACKEND_SECRET } : {}),
          },
          body,
          signal: controller.signal,
        });
      } catch (error) {
        lastRequestError = error;
      } finally {
        clearTimeout(timeout);
      }
    }
    if (!backendResponse) throw lastRequestError || new Error("Backend request failed");

    const responseBody = await backendResponse.text();
    res.status(backendResponse.status);
    res.setHeader("Content-Type", backendResponse.headers.get("content-type") || "application/json");
    return res.send(responseBody);
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "The scorer timed out."
        : error instanceof Error
        ? error.message
        : "Backend request failed.";
    console.error("practice_rate_proxy_failed", {
      backendUrl: `${API_BASE.replace(/\/$/, "")}/api/v1/practice/rate`,
      reason,
    });
    return res.status(502).json({
      error: "The practice rating service is unavailable.",
      reason,
    });
  } finally {
    await fs.unlink(audio.filepath).catch(() => undefined);
  }
}
