import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { IncomingForm, type File as FormidableFile } from "formidable";
import { promises as fs } from "fs";
import { authOptions } from "./auth/[...nextauth]";
import { prisma } from "../../lib/prisma";
import { tabSegmentsToStamps } from "../../lib/tabTextToStamps";
import {
  buildCreditsSummary,
  durationToCredits,
  getCreditWindow,
  DEFAULT_DURATION_SEC,
} from "../../lib/credits";

const API_BASE = "http://127.0.0.1:8000";

type Mode = "FILE" | "YOUTUBE";

type YouTubePayload = {
  mode: "YOUTUBE";
  youtubeUrl: string;
  startTime: number;
  duration: number;
  separateGuitar?: boolean;
};

type FilePayload = {
  mode: "FILE";
  duration?: number;
};

async function readJsonBody(req: NextApiRequest) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
}

async function parseMultipart(req: NextApiRequest): Promise<{
  fields: Record<string, any>;
  file?: FormidableFile;
}> {
  return await new Promise((resolve, reject) => {
    const form = new IncomingForm({ multiples: false, keepExtensions: true });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      const fileEntry = files.file;
      const file = Array.isArray(fileEntry)
        ? fileEntry[0]
        : fileEntry
        ? (fileEntry as FormidableFile)
        : undefined;
      resolve({ fields, file });
    });
  });
}

async function fetchJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(text || "Invalid JSON from backend.");
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const normalizeMode = (value: any): Mode | null => {
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw !== "string") return null;
    const upper = raw.toUpperCase();
    if (upper === "FILE" || upper === "YOUTUBE") return upper as Mode;
    return null;
  };

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    const isPremium =
      user.role === "PREMIUM" || user.role === "ADMIN" || user.role === "MODERATOR" || user.role === "MOD";
    const creditWindow = getCreditWindow();
    const creditJobs = await prisma.tabJob.findMany({
      where: isPremium
        ? { userId: session.user.id }
        : {
            userId: session.user.id,
            createdAt: {
              gte: creditWindow.start,
              lt: creditWindow.resetAt,
            },
          },
      select: { durationSec: true },
    });
    const refreshedCredits = buildCreditsSummary({
      durations: creditJobs.map((job) => job.durationSec),
      resetAt: creditWindow.resetAt,
      isPremium,
      userCreatedAt: user.createdAt,
    });

    const contentType = req.headers["content-type"] || "";
    let mode: Mode | null = null;
    let youtubePayload: YouTubePayload | null = null;
    let filePayload: FilePayload | null = null;
    let uploadedFile: FormidableFile | undefined;

    if (contentType.includes("multipart/form-data")) {
      const { fields, file } = await parseMultipart(req);
      uploadedFile = file;
      mode = normalizeMode(fields.mode) || normalizeMode(fields.type) || "FILE";
      if (mode === "YOUTUBE") {
        youtubePayload = {
          mode: "YOUTUBE",
          youtubeUrl: String(fields.youtubeUrl || fields.link || ""),
          startTime: Number(fields.startTime || fields.start_time || 0),
          duration: Number(fields.duration || 0),
          separateGuitar:
            fields.separateGuitar === "true" ||
            fields.separate_guitar === "true" ||
            fields.separateGuitar === true,
        };
      } else {
        filePayload = {
          mode: "FILE",
          duration: Number(fields.duration || fields.durationSec || 0) || undefined,
        };
      }
    } else {
      const body = (await readJsonBody(req)) as YouTubePayload | FilePayload;
      mode = normalizeMode(body?.mode) || null;
      if (mode === "YOUTUBE") youtubePayload = body as YouTubePayload;
      if (mode === "FILE") filePayload = body as FilePayload;
    }

    if (mode !== "FILE" && mode !== "YOUTUBE") {
      return res.status(400).json({ error: "Invalid mode" });
    }
    if (mode === "YOUTUBE" && (!youtubePayload?.youtubeUrl || youtubePayload.youtubeUrl === "")) {
      return res.status(400).json({ error: "YouTube URL is required." });
    }

    const durationSec =
      mode === "YOUTUBE"
        ? Math.max(1, Math.ceil(youtubePayload?.duration || 0))
        : Math.max(1, Math.ceil(filePayload?.duration || DEFAULT_DURATION_SEC));
    const requiredCredits = durationToCredits(durationSec);

    if (refreshedCredits.remaining < requiredCredits) {
      const resetLabel = refreshedCredits.resetAt.slice(0, 10);
      const errorMessage = isPremium
        ? `Credits used. More credits arrive on ${resetLabel}.`
        : `Monthly credits used. Upgrade to Premium or wait until ${resetLabel} for a reset.`;
      return res
        .status(403)
        .json({
          error: errorMessage,
          credits: refreshedCredits,
        });
    }

    let tabs: string[][] = [];
    let sourceLabel = "";

    if (mode === "YOUTUBE" && youtubePayload) {
      const fdYt = new FormData();
      fdYt.append("link", youtubePayload.youtubeUrl);
      fdYt.append("start_time", String(youtubePayload.startTime || 0));
      fdYt.append("duration", String(youtubePayload.duration || 0));
      fdYt.append("separate_guitar", youtubePayload.separateGuitar ? "true" : "false");

      const ytRes = await fetch(`${API_BASE}/yt_processor`, { method: "POST", body: fdYt });
      if (!ytRes.ok) {
        const bodyText = await ytRes.text();
        return res.status(ytRes.status).json({ error: `yt_processor error: ${bodyText}` });
      }

      const wavBlob = await ytRes.blob();
      const fdProcess = new FormData();
      fdProcess.append("file", wavBlob, "yt_segment.wav");
      const processRes = await fetch(`${API_BASE}/process_audio/`, {
        method: "POST",
        body: fdProcess,
      });
      if (!processRes.ok) {
        const bodyText = await processRes.text();
        return res.status(processRes.status).json({ error: `process_audio error: ${bodyText}` });
      }
      const data = await fetchJson<{ result: string[][] }>(processRes);
      tabs = data.result;
      sourceLabel = youtubePayload.youtubeUrl;
    }

    if (mode === "FILE") {
      if (!uploadedFile?.filepath) {
        return res.status(400).json({ error: "File is required." });
      }
      const buffer = await fs.readFile(uploadedFile.filepath);
      const fd = new FormData();
      fd.append(
        "file",
        new Blob([buffer], {
          type: uploadedFile.mimetype || "application/octet-stream",
        }),
        uploadedFile.originalFilename || "upload"
      );
      const processRes = await fetch(`${API_BASE}/process_audio/`, {
        method: "POST",
        body: fd,
      });
      if (!processRes.ok) {
        const bodyText = await processRes.text();
        return res.status(processRes.status).json({ error: `process_audio error: ${bodyText}` });
      }
      const data = await fetchJson<{ result: string[][] }>(processRes);
      tabs = data.result;
      sourceLabel = uploadedFile.originalFilename || "upload";
      if (uploadedFile.filepath) {
        void fs.unlink(uploadedFile.filepath).catch(() => {});
      }
    }

    if (!tabs?.length) {
      return res.status(500).json({ error: "Transcription returned no data." });
    }

    let updatedTokens = user.tokensRemaining;
    const updatedUsed = refreshedCredits.used + requiredCredits;
    const updatedRemaining = Math.max(0, refreshedCredits.limit - updatedUsed);
    const creditsAfter = {
      ...refreshedCredits,
      used: updatedUsed,
      remaining: updatedRemaining,
    };
    if (user.role === "FREE") {
      updatedTokens = updatedRemaining;
      await prisma.user.update({
        where: { id: user.id },
        data: { tokensRemaining: updatedTokens },
      });
    }

    const job = await prisma.tabJob.create({
      data: {
        userId: user.id,
        sourceType: mode,
        sourceLabel,
        durationSec: durationSec || null,
        resultJson: JSON.stringify(tabs),
      },
    });

    let gteEditorId: string | null = null;
    try {
      const { stamps, totalFrames } = tabSegmentsToStamps(tabs);
      const createRes = await fetch(`${API_BASE}/gte/editors`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": user.id,
        },
        body: JSON.stringify({}),
      });
      if (createRes.ok) {
        const created = (await createRes.json()) as { editorId?: string };
        if (created?.editorId) {
          let importOk = true;
          if (stamps.length > 0) {
            const importRes = await fetch(`${API_BASE}/gte/editors/${created.editorId}/import`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-User-Id": user.id,
              },
              body: JSON.stringify({ stamps, totalFrames }),
            });
            importOk = importRes.ok;
          }
          if (importOk) {
            gteEditorId = created.editorId;
          }
        }
      }
    } catch (error) {
      console.warn("GTE sync failed", error);
    }

    if (gteEditorId) {
      await prisma.tabJob.update({
        where: { id: job.id },
        data: { gteEditorId },
      });
    }

    return res.status(200).json({
      tabs,
      tokensRemaining: updatedTokens,
      credits: creditsAfter,
      jobId: job.id,
      gteEditorId,
    });
  } catch (error) {
    console.error("transcribe error", error);
    return res.status(500).json({ error: "Transcription failed." });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
