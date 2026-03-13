import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { IncomingForm, type File as FormidableFile } from "formidable";
import { promises as fs } from "fs";
import { authOptions } from "./auth/[...nextauth]";
import { prisma } from "../../lib/prisma";
import { logGteAnalyticsEvent } from "../../lib/gteAnalytics";
import { tabSegmentsToStamps } from "../../lib/tabTextToStamps";
import {
  type CreditsSummary,
  buildCreditsSummary,
  durationToCredits,
  getCreditWindow,
  DEFAULT_DURATION_SEC,
} from "../../lib/credits";

const API_BASE = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
const BACKEND_SECRET =
  process.env.BACKEND_SHARED_SECRET || process.env.NOTE2TABS_BACKEND_SECRET;

type Mode = "FILE" | "YOUTUBE";

type YouTubePayload = {
  mode: "YOUTUBE";
  youtubeUrl: string;
  startTime: number;
  duration: number;
  separateGuitar?: boolean;
  skipAutoEditorSync?: boolean;
};

type FilePayload = {
  mode: "FILE";
  duration?: number;
  s3Key?: string;
  fileName?: string;
  skipAutoEditorSync?: boolean;
};

type SerializedTranscriberSegment = {
  lineStart: number;
  lineEnd: number;
  midiNum?: number | null;
  MidiNumLine: number[];
};

type SerializedTranscriberSegmentGroup = SerializedTranscriberSegment[];

const buildDevCreditsSummary = (): CreditsSummary => ({
  used: 0,
  limit: 9999,
  remaining: 9999,
  resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  unlimited: true,
});

function buildDevWorkerUserId() {
  return `local-dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseBooleanLike(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return parseBooleanLike(value[0]);
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  }
  return false;
}

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

function normalizeTabLine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toTabSegments(value: unknown): string[][] {
  if (typeof value === "string") {
    const lines = value
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0);
    return lines.length ? [lines] : [];
  }

  if (!Array.isArray(value)) return [];
  if (!value.length) return [];

  const first = value[0];
  if (typeof first === "string") {
    const lines = value
      .map((line) => normalizeTabLine(line))
      .filter((line): line is string => Boolean(line));
    return lines.length ? [lines] : [];
  }

  return value
    .map((segment) => {
      if (!Array.isArray(segment)) return [];
      return segment
        .map((line) => normalizeTabLine(line))
        .filter((line): line is string => Boolean(line));
    })
    .filter((segment) => segment.length > 0);
}

function extractTabsFromPayload(payload: unknown): string[][] {
  if (!payload || typeof payload !== "object") {
    return toTabSegments(payload);
  }

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.result,
    record.tabs,
    record.data,
    record.output,
    record.response,
  ];

  for (const candidate of candidates) {
    const normalized = toTabSegments(candidate);
    if (normalized.length > 0) return normalized;
  }

  if (record.data && typeof record.data === "object") {
    const nested = record.data as Record<string, unknown>;
    for (const candidate of [nested.result, nested.tabs, nested.output]) {
      const normalized = toTabSegments(candidate);
      if (normalized.length > 0) return normalized;
    }
  }

  return [];
}

function normalizeTranscriberSegment(value: unknown): SerializedTranscriberSegment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const midiNumLine = Array.isArray(record.MidiNumLine)
    ? record.MidiNumLine
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry))
        .map((entry) => Math.round(entry))
    : [];
  const midiNum =
    record.midiNum === null || record.midiNum === undefined
      ? null
      : Number.isFinite(Number(record.midiNum))
      ? Math.round(Number(record.midiNum))
      : null;
  if (midiNumLine.length === 0 && midiNum === null) {
    return null;
  }
  const lineStart = Number.isFinite(Number(record.lineStart)) ? Math.max(0, Math.round(Number(record.lineStart))) : 0;
  const defaultLineEnd = lineStart + Math.max(0, midiNumLine.length - 1);
  const lineEnd = Number.isFinite(Number(record.lineEnd))
    ? Math.max(lineStart, Math.round(Number(record.lineEnd)))
    : defaultLineEnd;
  return {
    lineStart,
    lineEnd,
    midiNum,
    MidiNumLine: midiNumLine.length > 0 ? midiNumLine : midiNum !== null ? [midiNum] : [],
  };
}

function extractTranscriberSegmentGroupsFromPayload(payload: unknown): SerializedTranscriberSegmentGroup[] {
  const fromValue = (value: unknown): SerializedTranscriberSegmentGroup[] => {
    if (!Array.isArray(value)) return [];
    return value
      .map((group) => {
        if (!Array.isArray(group)) return [];
        return group
          .map((segment) => normalizeTranscriberSegment(segment))
          .filter((segment): segment is SerializedTranscriberSegment => Boolean(segment));
      })
      .filter((group) => group.length > 0);
  };

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return fromValue(payload);
  }

  const record = payload as Record<string, unknown>;
  const direct = fromValue(record.segmentGroups ?? record.transcriberSegments);
  if (direct.length > 0) return direct;

  if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
    const nested = record.data as Record<string, unknown>;
    const nestedGroups = fromValue(nested.segmentGroups ?? nested.transcriberSegments);
    if (nestedGroups.length > 0) return nestedGroups;
  }

  return [];
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
    const allowDevGuestTranscription = process.env.NODE_ENV !== "production";
    let session = null;
    if (!allowDevGuestTranscription) {
      try {
        session = await getServerSession(req, res, authOptions);
      } catch (error) {
        throw error;
      }
    }

    let user: Awaited<ReturnType<typeof prisma.user.findUnique>> | null = null;
    let isPremium = false;
    let refreshedCredits: CreditsSummary = buildDevCreditsSummary();

    if (session?.user?.id) {
      try {
        user = await prisma.user.findUnique({ where: { id: session.user.id } });
        if (!user) {
          if (!allowDevGuestTranscription) {
            return res.status(401).json({ error: "User not found" });
          }
          console.warn("transcribe user lookup returned no user, using dev guest fallback");
        } else {
          const isEmailVerified = Boolean((user as any).emailVerifiedBool || user.emailVerified);
          if (!isEmailVerified) {
            return res.status(403).json({
              error: "Please verify your email before using the transcriber.",
              verificationRequired: true,
            });
          }
          if (!(user as any).emailVerifiedBool) {
            await prisma.user.update({
              where: { id: user.id },
              data: { ...( { emailVerifiedBool: true } as any) } as any,
            });
          }
          isPremium =
            user.role === "PREMIUM" ||
            user.role === "ADMIN" ||
            user.role === "MODERATOR" ||
            user.role === "MOD";
          const creditWindow = isPremium
            ? getCreditWindow({ userCreatedAt: user.createdAt })
            : getCreditWindow();
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
          refreshedCredits = buildCreditsSummary({
            durations: creditJobs.map((job) => job.durationSec),
            resetAt: creditWindow.resetAt,
            isPremium,
            userCreatedAt: user.createdAt,
          });
          if (!isPremium && user.tokensRemaining !== refreshedCredits.remaining) {
            user.tokensRemaining = refreshedCredits.remaining;
            try {
              await prisma.user.update({
                where: { id: user.id },
                data: { tokensRemaining: refreshedCredits.remaining },
              });
            } catch (error) {
              console.warn("transcribe monthly credit sync failed", error);
            }
          }
        }
      } catch (error) {
        user = null;
        if (!allowDevGuestTranscription) {
          throw error;
        }
        console.warn("transcribe database sync failed, using dev guest fallback", error);
      }
    } else if (!allowDevGuestTranscription) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const contentType = req.headers["content-type"] || "";
    let mode: Mode | null = null;
    let youtubePayload: YouTubePayload | null = null;
    let filePayload: FilePayload | null = null;
    let uploadedFile: FormidableFile | undefined;
    let skipAutoEditorSync = false;
    const backendHeaders: Record<string, string> = {};
    if (allowDevGuestTranscription) {
      // The local worker keeps its own credit ledger, so use a transient dev-only id.
      backendHeaders["X-User-Id"] = buildDevWorkerUserId();
    }
    if (BACKEND_SECRET) {
      backendHeaders["X-Backend-Secret"] = BACKEND_SECRET;
    }

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
          skipAutoEditorSync: parseBooleanLike(fields.skipAutoEditorSync),
        };
        skipAutoEditorSync = Boolean(youtubePayload.skipAutoEditorSync);
      } else {
        filePayload = {
          mode: "FILE",
          duration: Number(fields.duration || fields.durationSec || 0) || undefined,
          skipAutoEditorSync: parseBooleanLike(fields.skipAutoEditorSync),
        };
        skipAutoEditorSync = Boolean(filePayload.skipAutoEditorSync);
      }
    } else {
      const body = (await readJsonBody(req)) as YouTubePayload | FilePayload;
      mode = normalizeMode(body?.mode) || null;
      if (mode === "YOUTUBE") youtubePayload = body as YouTubePayload;
      if (mode === "FILE") filePayload = body as FilePayload;
      skipAutoEditorSync = parseBooleanLike((body as { skipAutoEditorSync?: unknown })?.skipAutoEditorSync);
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
    let transcriberSegmentGroups: SerializedTranscriberSegmentGroup[] = [];
    let lastBackendPayload: unknown = null;
    let sourceLabel = "";

    if (mode === "YOUTUBE" && youtubePayload) {
      const fdYt = new FormData();
      fdYt.append("link", youtubePayload.youtubeUrl);
      fdYt.append("start_time", String(youtubePayload.startTime || 0));
      fdYt.append("duration", String(youtubePayload.duration || 0));
      fdYt.append("separate_guitar", youtubePayload.separateGuitar ? "true" : "false");

      const ytRes = await fetch(`${API_BASE}/yt_processor`, {
        method: "POST",
        headers: backendHeaders,
        body: fdYt,
      });
      if (!ytRes.ok) {
        const bodyText = await ytRes.text();
        return res.status(ytRes.status).json({ error: `yt_processor error: ${bodyText}` });
      }

      const wavBlob = await ytRes.blob();
      const fdProcess = new FormData();
      fdProcess.append("file", wavBlob, "yt_segment.wav");
      const processRes = await fetch(`${API_BASE}/process_audio/`, {
        method: "POST",
        headers: backendHeaders,
        body: fdProcess,
      });
      if (!processRes.ok) {
        const bodyText = await processRes.text();
        return res.status(processRes.status).json({ error: `process_audio error: ${bodyText}` });
      }
      const data = await fetchJson<unknown>(processRes);
      lastBackendPayload = data;
      tabs = extractTabsFromPayload(data);
      transcriberSegmentGroups = extractTranscriberSegmentGroupsFromPayload(data);
      sourceLabel = youtubePayload.youtubeUrl;
    }

    if (mode === "FILE") {
      if (filePayload?.s3Key) {
        const processRes = await fetch(`${API_BASE}/process_audio_s3`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...backendHeaders,
          },
          body: JSON.stringify({
            s3Key: filePayload.s3Key,
            fileName: filePayload.fileName,
          }),
        });
        if (!processRes.ok) {
          const bodyText = await processRes.text();
          return res.status(processRes.status).json({ error: `process_audio_s3 error: ${bodyText}` });
        }
        const data = await fetchJson<unknown>(processRes);
        lastBackendPayload = data;
        tabs = extractTabsFromPayload(data);
        transcriberSegmentGroups = extractTranscriberSegmentGroupsFromPayload(data);
        sourceLabel = filePayload.fileName || "upload";
      } else {
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
          headers: backendHeaders,
          body: fd,
        });
        if (!processRes.ok) {
          const bodyText = await processRes.text();
          return res.status(processRes.status).json({ error: `process_audio error: ${bodyText}` });
        }
        const data = await fetchJson<unknown>(processRes);
        lastBackendPayload = data;
        tabs = extractTabsFromPayload(data);
        transcriberSegmentGroups = extractTranscriberSegmentGroupsFromPayload(data);
        sourceLabel = uploadedFile.originalFilename || "upload";
        if (uploadedFile.filepath) {
          void fs.unlink(uploadedFile.filepath).catch(() => {});
        }
      }
    }

    if (!tabs?.length) {
      const backendError =
        lastBackendPayload &&
        typeof lastBackendPayload === "object" &&
        typeof (lastBackendPayload as { error?: unknown }).error === "string"
          ? ((lastBackendPayload as { error: string }).error || "").trim()
          : "";
      if (process.env.NODE_ENV !== "production") {
        console.warn("transcribe backend returned no tab segments", {
          mode,
          sourceLabel,
          payloadType: Array.isArray(lastBackendPayload) ? "array" : typeof lastBackendPayload,
          payloadKeys:
            lastBackendPayload && typeof lastBackendPayload === "object" && !Array.isArray(lastBackendPayload)
              ? Object.keys(lastBackendPayload as Record<string, unknown>)
              : [],
        });
      }
      return res.status(500).json({
        error: backendError || "Transcription returned no data.",
      });
    }

    let updatedTokens = user?.tokensRemaining ?? refreshedCredits.remaining;
    const updatedUsed = refreshedCredits.used + requiredCredits;
    const updatedRemaining = Math.max(0, refreshedCredits.limit - updatedUsed);
    const creditsAfter = {
      ...refreshedCredits,
      used: updatedUsed,
      remaining: updatedRemaining,
    };
    let persistedUser = user;
    if (persistedUser?.role === "FREE") {
      updatedTokens = updatedRemaining;
      try {
        await prisma.user.update({
          where: { id: persistedUser.id },
          data: { tokensRemaining: updatedTokens },
        });
      } catch (error) {
        if (!allowDevGuestTranscription) {
          throw error;
        }
        persistedUser = null;
        console.warn("transcribe credit update skipped in dev", error);
      }
    }

    let jobId: string | undefined;
    if (persistedUser) {
      try {
        const job = await prisma.tabJob.create({
          data: {
            userId: persistedUser.id,
            sourceType: mode,
            sourceLabel,
            durationSec: durationSec || null,
            resultJson: JSON.stringify(tabs),
          },
        });
        jobId = job.id;
      } catch (error) {
        if (!allowDevGuestTranscription) {
          throw error;
        }
        persistedUser = null;
        console.warn("transcribe job persistence skipped in dev", error);
      }
    }

    let gteEditorId: string | null = null;
    if (persistedUser && !skipAutoEditorSync) {
      try {
        if (transcriberSegmentGroups.length > 0) {
          const importRes = await fetch(`${API_BASE}/gte/transcriber/import`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-User-Id": persistedUser.id,
              ...(BACKEND_SECRET ? { "X-Backend-Secret": BACKEND_SECRET } : {}),
            },
            body: JSON.stringify({
              target: "new",
              segmentGroups: transcriberSegmentGroups,
            }),
          });
          if (importRes.ok) {
            const imported = (await importRes.json()) as { editorId?: string };
            if (imported?.editorId) {
              gteEditorId = imported.editorId;
            }
          }
        }
        if (!gteEditorId) {
          const { stamps, totalFrames } = tabSegmentsToStamps(tabs);
          const createRes = await fetch(`${API_BASE}/gte/editors`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-User-Id": persistedUser.id,
              ...(BACKEND_SECRET ? { "X-Backend-Secret": BACKEND_SECRET } : {}),
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
                    "X-User-Id": persistedUser.id,
                    ...(BACKEND_SECRET ? { "X-Backend-Secret": BACKEND_SECRET } : {}),
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
        }
        if (gteEditorId) {
          await logGteAnalyticsEvent({
            userId: persistedUser.id,
            event: "gte_editor_created",
            path: "/api/transcribe",
            payload: { editorId: gteEditorId, source: "transcribe" },
            req,
            res,
          });
        }
      } catch (error) {
        console.warn("GTE sync failed", error);
      }
    }

    if (gteEditorId && jobId && persistedUser) {
      try {
        await prisma.tabJob.update({
          where: { id: jobId },
          data: { gteEditorId },
        });
      } catch (error) {
        if (!allowDevGuestTranscription) {
          throw error;
        }
        console.warn("transcribe job sync skipped in dev", error);
      }
    }

    return res.status(200).json({
      tabs,
      transcriberSegments: transcriberSegmentGroups.length > 0 ? transcriberSegmentGroups : undefined,
      tokensRemaining: updatedTokens,
      credits: user ? creditsAfter : undefined,
      jobId,
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
