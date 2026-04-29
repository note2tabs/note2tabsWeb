import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { IncomingForm, type File as FormidableFile } from "formidable";
import { promises as fs } from "fs";
import { authOptions } from "./auth/[...nextauth]";
import { prisma } from "../../lib/prisma";
import {
  type CreditsSummary,
  buildDevCreditsSummary,
  buildCreditsSummary,
  calculateCreditsUsedFromDurationCounts,
  durationToCredits,
  getCreditWindow,
  DEFAULT_DURATION_SEC,
  reconcileCreditsWithStoredBalance,
} from "../../lib/credits";
import {
  isEmailVerificationRequiredServer,
  isLocalNoDbServerMode,
} from "../../lib/serverDevMode";
import { serializeStoredTabPayload } from "../../lib/storedTabs";

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
  multipleGuitars?: boolean;
  skipAutoEditorSync?: boolean;
};

type FilePayload = {
  mode: "FILE";
  duration?: number;
  s3Key?: string;
  fileName?: string;
  separateGuitar?: boolean;
  multipleGuitars?: boolean;
  skipAutoEditorSync?: boolean;
};

type SerializedTranscriberSegment = {
  lineStart: number;
  lineEnd: number;
  midiNum?: number | null;
  MidiNumLine: number[];
};

type SerializedTranscriberSegmentGroup = SerializedTranscriberSegment[];

const JOB_POLL_INTERVAL_MS = 1500;
const JOB_POLL_TIMEOUT_MS = 15000;
const BACKEND_PENDING_JOB_STATUSES = new Set(["queued", "pending", "processing", "running"]);
const BACKEND_FINISHED_JOB_STATUSES = new Set(["done", "completed", "succeeded", "success"]);
const BACKEND_FAILED_JOB_STATUSES = new Set(["error", "failed", "cancelled", "canceled"]);

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

function parseOptionalBooleanLike(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  if (Array.isArray(value) && value.length === 0) return undefined;
  return parseBooleanLike(value);
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
    const trimmed = value.trim();
    if ((trimmed.startsWith("[") || trimmed.startsWith("{")) && trimmed.length > 1) {
      try {
        const parsed = JSON.parse(trimmed);
        const nested = toTabSegments(parsed);
        if (nested.length > 0) return nested;
      } catch (error) {}
    }
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

function findFirstInPayload<T>(
  payload: unknown,
  normalize: (value: unknown) => T | null,
  preferredKeys: string[],
  maxDepth = 6
): T | null {
  const seen = new Set<unknown>();

  const visit = (value: unknown, depth: number): T | null => {
    const normalized = normalize(value);
    if (normalized !== null) return normalized;

    if (depth >= maxDepth || !value || typeof value !== "object") {
      return null;
    }

    if (seen.has(value)) {
      return null;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      for (const entry of value) {
        const nested = visit(entry, depth + 1);
        if (nested !== null) return nested;
      }
      return null;
    }

    const record = value as Record<string, unknown>;
    for (const key of preferredKeys) {
      if (!(key in record)) continue;
      const nested = visit(record[key], depth + 1);
      if (nested !== null) return nested;
    }

    for (const [key, entry] of Object.entries(record)) {
      if (preferredKeys.includes(key)) continue;
      const nested = visit(entry, depth + 1);
      if (nested !== null) return nested;
    }

    return null;
  };

  return visit(payload, 0);
}

function extractTabsFromPayload(payload: unknown): string[][] {
  return (
    findFirstInPayload<string[][]>(
      payload,
      (value) => {
        const normalized = toTabSegments(value);
        return normalized.length > 0 ? normalized : null;
      },
      ["tabs", "tabText", "tab_text", "result", "output", "data", "response", "payload", "body"]
    ) || []
  );
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
    const singleGroup = value
      .map((segment) => normalizeTranscriberSegment(segment))
      .filter((segment): segment is SerializedTranscriberSegment => Boolean(segment));
    if (singleGroup.length > 0) {
      return [singleGroup];
    }
    return value
      .map((group) => {
        if (!Array.isArray(group)) return [];
        return group
          .map((segment) => normalizeTranscriberSegment(segment))
          .filter((segment): segment is SerializedTranscriberSegment => Boolean(segment));
      })
      .filter((group) => group.length > 0);
  };

  return (
    findFirstInPayload<SerializedTranscriberSegmentGroup[]>(
      payload,
      (value) => {
        const normalized = fromValue(value);
        return normalized.length > 0 ? normalized : null;
      },
      ["segmentGroups", "transcriberSegments", "segments", "result", "output", "data", "response", "payload"]
    ) || []
  );
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractBackendJobId(payload: unknown): string | null {
  const record = getRecord(payload);
  if (!record) return null;
  const candidates = [record.job_id, record.jobId];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function extractBackendJobStatus(payload: unknown): string | null {
  const record = getRecord(payload);
  if (!record || typeof record.status !== "string") return null;
  const normalized = record.status.trim().toLowerCase();
  return normalized || null;
}

function extractBackendJobError(payload: unknown): string {
  const record = getRecord(payload);
  if (!record) return "";
  const directCandidates = [
    record.lastError,
    record.error_message,
    record.errorMessage,
    record.error,
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  const detail = getRecord(record.detail);
  if (detail && typeof detail.error === "string" && detail.error.trim()) {
    return detail.error.trim();
  }
  return "";
}

function extractBackendJobOutput(payload: unknown): unknown {
  const record = getRecord(payload);
  if (!record) return payload;
  if ("tabs" in record || "transcriberSegments" in record || "segmentGroups" in record) {
    return payload;
  }
  return record.output ?? record.result ?? record.data ?? payload;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBackendJobPayload(jobId: string, headers: Record<string, string>) {
  const response = await fetch(`${API_BASE}/api/v1/jobs/${encodeURIComponent(jobId)}`, {
    headers,
  });
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(bodyText || `Failed to fetch backend job ${jobId}.`);
  }
  return fetchJson<unknown>(response);
}

async function waitForBackendJobResult(initialPayload: unknown, headers: Record<string, string>) {
  const jobId = extractBackendJobId(initialPayload);
  if (!jobId) {
    return { jobId: null, completed: true, payload: initialPayload };
  }

  let currentPayload = initialPayload;
  const deadline = Date.now() + JOB_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const status = extractBackendJobStatus(currentPayload);
    if (status && BACKEND_FINISHED_JOB_STATUSES.has(status)) {
      return { jobId, completed: true, payload: currentPayload };
    }
    if (status && BACKEND_FAILED_JOB_STATUSES.has(status)) {
      return { jobId, completed: true, payload: currentPayload };
    }
    if (!status || !BACKEND_PENDING_JOB_STATUSES.has(status)) {
      return { jobId, completed: true, payload: currentPayload };
    }
    await sleep(JOB_POLL_INTERVAL_MS);
    currentPayload = await fetchBackendJobPayload(jobId, headers);
  }

  return { jobId, completed: false, payload: currentPayload };
}

async function syncBackendCredits(userId: string, credits: number, headers: Record<string, string>) {
  const response = await fetch(`${API_BASE}/api/v1/credits/set`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      userId,
      credits: Math.max(0, Math.floor(credits)),
    }),
  });
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(bodyText || "Failed to sync backend credits.");
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
  let reservedUnverifiedTranscriptionUserId: string | null = null;
  const releaseUnverifiedTranscriptionReservation = async () => {
    if (!reservedUnverifiedTranscriptionUserId) return;
    const userId = reservedUnverifiedTranscriptionUserId;
    reservedUnverifiedTranscriptionUserId = null;
    try {
      await prisma.user.updateMany({
        where: {
          id: userId,
          emailVerified: null,
          emailVerifiedBool: false,
          unverifiedTranscriptionUsed: true,
        },
        data: { unverifiedTranscriptionUsed: false },
      });
    } catch (error) {
      console.warn("transcribe unverified allowance reservation release failed", error);
    }
  };

  try {
    const allowDevGuestTranscription = isLocalNoDbServerMode;
    let session = null;
    if (!allowDevGuestTranscription) {
      try {
        session = await getServerSession(req, res, authOptions);
      } catch (error) {
        throw error;
      }
    }

    let user: {
      id: string;
      role: string;
      tokensRemaining: number;
      emailVerified: Date | null;
      emailVerifiedBool: boolean;
      unverifiedTranscriptionUsed: boolean;
      createdAt: Date;
    } | null = null;
    let isPremium = false;
    let refreshedCredits: CreditsSummary = buildDevCreditsSummary();

    if (session?.user?.id) {
      try {
        user = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: {
            id: true,
            role: true,
            tokensRemaining: true,
            emailVerified: true,
            emailVerifiedBool: true,
            unverifiedTranscriptionUsed: true,
            createdAt: true,
          },
        });
        if (!user) {
          if (!allowDevGuestTranscription) {
            return res.status(401).json({ error: "User not found" });
          }
          console.warn("transcribe user lookup returned no user, using dev guest fallback");
        } else {
          const isEmailVerified = Boolean((user as any).emailVerifiedBool || user.emailVerified);
          if (isEmailVerificationRequiredServer && !isEmailVerified && user.unverifiedTranscriptionUsed) {
            return res.status(403).json({
              error: "Please verify your email to continue using the transcriber.",
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
          const creditDurationCounts = await prisma.tabJob.groupBy({
            by: ["durationSec"],
            where: isPremium
              ? { userId: session.user.id }
              : {
                  userId: session.user.id,
                  createdAt: {
                    gte: creditWindow.start,
                    lt: creditWindow.resetAt,
                  },
                },
            _count: { _all: true },
          });
          const computedCredits = buildCreditsSummary({
            usedCredits: calculateCreditsUsedFromDurationCounts(
              creditDurationCounts.map((item) => ({
                durationSec: item.durationSec,
                count: item._count._all,
              }))
            ),
            resetAt: creditWindow.resetAt,
            isPremium,
            userCreatedAt: user.createdAt,
          });
          refreshedCredits = isPremium
            ? reconcileCreditsWithStoredBalance(computedCredits, user.tokensRemaining)
            : computedCredits;
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
    if (user?.id) {
      backendHeaders["X-User-Id"] = user.id;
    } else if (session?.user?.id) {
      backendHeaders["X-User-Id"] = session.user.id;
    } else if (allowDevGuestTranscription) {
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
          multipleGuitars: parseOptionalBooleanLike(fields.multipleGuitars ?? fields.multiple_guitars),
          skipAutoEditorSync: parseBooleanLike(fields.skipAutoEditorSync),
        };
        skipAutoEditorSync = Boolean(youtubePayload.skipAutoEditorSync);
      } else {
        filePayload = {
          mode: "FILE",
          duration: Number(fields.duration || fields.durationSec || 0) || undefined,
          separateGuitar: parseBooleanLike(fields.separateGuitar ?? fields.separate_guitar),
          multipleGuitars: parseOptionalBooleanLike(fields.multipleGuitars ?? fields.multiple_guitars),
          skipAutoEditorSync: parseBooleanLike(fields.skipAutoEditorSync),
        };
        skipAutoEditorSync = Boolean(filePayload.skipAutoEditorSync);
      }
    } else {
      const body = (await readJsonBody(req)) as YouTubePayload | FilePayload;
      mode = normalizeMode(body?.mode) || null;
      if (mode === "YOUTUBE") {
        youtubePayload = {
          ...(body as YouTubePayload),
          separateGuitar: parseBooleanLike(
            (body as { separateGuitar?: unknown; separate_guitar?: unknown }).separateGuitar ??
              (body as { separate_guitar?: unknown }).separate_guitar
          ),
          multipleGuitars: parseOptionalBooleanLike(
            (body as { multipleGuitars?: unknown; multiple_guitars?: unknown }).multipleGuitars ??
              (body as { multiple_guitars?: unknown }).multiple_guitars
          ),
        };
      }
      if (mode === "FILE") {
        filePayload = {
          ...(body as FilePayload),
          separateGuitar: parseBooleanLike(
            (body as { separateGuitar?: unknown; separate_guitar?: unknown }).separateGuitar ??
              (body as { separate_guitar?: unknown }).separate_guitar
          ),
          multipleGuitars: parseOptionalBooleanLike(
            (body as { multipleGuitars?: unknown; multiple_guitars?: unknown }).multipleGuitars ??
              (body as { multiple_guitars?: unknown }).multiple_guitars
          ),
        };
      }
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

    if (user?.id) {
      await syncBackendCredits(user.id, refreshedCredits.remaining, backendHeaders);
    }

    let reservedUnverifiedTranscription = false;
    const shouldReserveUnverifiedTranscription =
      Boolean(user?.id) &&
      isEmailVerificationRequiredServer &&
      !Boolean((user as any)?.emailVerifiedBool || user?.emailVerified);
    if (shouldReserveUnverifiedTranscription && user?.id) {
      const reservation = await prisma.user.updateMany({
        where: {
          id: user.id,
          emailVerified: null,
          emailVerifiedBool: false,
          unverifiedTranscriptionUsed: false,
        },
        data: { unverifiedTranscriptionUsed: true },
      });
      if (reservation.count !== 1) {
        return res.status(403).json({
          error: "Please verify your email to continue using the transcriber.",
          verificationRequired: true,
        });
      }
      user.unverifiedTranscriptionUsed = true;
      reservedUnverifiedTranscription = true;
      reservedUnverifiedTranscriptionUserId = user.id;
    }

    let backendJobId: string | undefined;
    const cleanupUploadedFile = () => {
      if (uploadedFile?.filepath) {
        void fs.unlink(uploadedFile.filepath).catch(() => {});
      }
    };

    if (mode === "YOUTUBE" && youtubePayload) {
      const fdYt = new FormData();
      fdYt.append("link", youtubePayload.youtubeUrl);
      fdYt.append("start_time", String(youtubePayload.startTime || 0));
      fdYt.append("duration", String(youtubePayload.duration || 0));
      fdYt.append("separate_guitar", youtubePayload.separateGuitar ? "true" : "false");
      if (youtubePayload.multipleGuitars !== undefined) {
        fdYt.append("multiple_guitars", youtubePayload.multipleGuitars ? "true" : "false");
      }

      const ytRes = await fetch(`${API_BASE}/yt_processor`, {
        method: "POST",
        headers: backendHeaders,
        body: fdYt,
      });
      if (!ytRes.ok) {
        const bodyText = await ytRes.text();
        await releaseUnverifiedTranscriptionReservation();
        return res.status(ytRes.status).json({ error: `yt_processor error: ${bodyText}` });
      }

      const data = await fetchJson<unknown>(ytRes);
      backendJobId = extractBackendJobId(data) || undefined;
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
            separate_guitar: Boolean(filePayload.separateGuitar),
            multiple_guitars: filePayload.multipleGuitars,
          }),
        });
        if (!processRes.ok) {
          const bodyText = await processRes.text();
          await releaseUnverifiedTranscriptionReservation();
          return res.status(processRes.status).json({ error: `process_audio_s3 error: ${bodyText}` });
        }
        const data = await fetchJson<unknown>(processRes);
        backendJobId = extractBackendJobId(data) || undefined;
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
        fd.append("separate_guitar", filePayload?.separateGuitar ? "true" : "false");
        if (filePayload?.multipleGuitars !== undefined) {
          fd.append("multiple_guitars", filePayload.multipleGuitars ? "true" : "false");
        }
        const processRes = await fetch(`${API_BASE}/process_audio/`, {
          method: "POST",
          headers: backendHeaders,
          body: fd,
        });
        if (!processRes.ok) {
          const bodyText = await processRes.text();
          await releaseUnverifiedTranscriptionReservation();
          return res.status(processRes.status).json({ error: `process_audio error: ${bodyText}` });
        }
        const data = await fetchJson<unknown>(processRes);
        backendJobId = extractBackendJobId(data) || undefined;
        cleanupUploadedFile();
      }
    }

    if (!backendJobId) {
      await releaseUnverifiedTranscriptionReservation();
      return res.status(502).json({ error: "Backend did not return a job id." });
    }
    reservedUnverifiedTranscriptionUserId = null;

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

    return res.status(202).json({
      tokensRemaining: updatedTokens,
      credits: user ? creditsAfter : undefined,
      jobId: backendJobId,
      status: "processing",
      unverifiedTranscriptionUsed: reservedUnverifiedTranscription || undefined,
    });
  } catch (error) {
    await releaseUnverifiedTranscriptionReservation();
    console.error("transcribe error", error);
    return res.status(500).json({ error: "Transcription failed." });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
