import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "../../../lib/prisma";
import { serializeStoredTabPayload } from "../../../lib/storedTabs";

const API_BASE = process.env.BACKEND_API_BASE_URL || "http://127.0.0.1:8000";
const BACKEND_SECRET =
  process.env.BACKEND_SHARED_SECRET || process.env.NOTE2TABS_BACKEND_SECRET;

function getJobSources(job: unknown) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return [] as Record<string, unknown>[];
  const direct = job as Record<string, unknown>;
  const output =
    direct.output && typeof direct.output === "object" && !Array.isArray(direct.output)
      ? (direct.output as Record<string, unknown>)
      : undefined;
  const result =
    direct.result && typeof direct.result === "object" && !Array.isArray(direct.result)
      ? (direct.result as Record<string, unknown>)
      : undefined;
  return [direct, output, result, output?.result as Record<string, unknown> | undefined, result?.output as Record<string, unknown> | undefined].filter(
    (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
  );
}

function getFirstJobValue(job: unknown, keys: string[]) {
  for (const source of getJobSources(job)) {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }
  return null;
}

function normalizeTabs(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value
    .map((segment) =>
      Array.isArray(segment)
        ? segment.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
        : []
    )
    .filter((segment) => segment.length > 0);
}

function normalizeTranscriberSegment(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if ("start_time_s" in record || "end_time_s" in record || "pitch_midi" in record) {
    const startTime = Number(record.start_time_s);
    const endTime = Number(record.end_time_s);
    const pitchMidi = Number(record.pitch_midi);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || !Number.isFinite(pitchMidi)) return null;
    const rawPitchBend = Array.isArray(record.pitch_bend)
      ? record.pitch_bend
          .map((entry) => Number(entry))
          .filter((entry) => Number.isFinite(entry))
          .map((entry) => Math.round(entry))
      : null;
    const amplitude =
      record.amplitude === null || record.amplitude === undefined
        ? null
        : Number.isFinite(Number(record.amplitude))
        ? Number(record.amplitude)
        : null;
    return {
      start_time_s: Math.max(0, Number(startTime)),
      end_time_s: Math.max(Number(startTime), Number(endTime)),
      pitch_midi: Math.round(Number(pitchMidi)),
      amplitude,
      pitch_bend: rawPitchBend,
    };
  }
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
  const lineStart = Number(record.lineStart);
  const lineEnd = Number(record.lineEnd);
  if (!Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) return null;
  if (midiNumLine.length === 0 && midiNum === null) return null;
  return {
    lineStart: Math.max(0, Math.round(lineStart)),
    lineEnd: Math.max(Math.round(lineStart), Math.round(lineEnd)),
    midiNum,
    MidiNumLine: midiNumLine.length > 0 ? midiNumLine : midiNum !== null ? [midiNum] : [],
  };
}

type NormalizedTranscriberSegment = NonNullable<ReturnType<typeof normalizeTranscriberSegment>>;

function normalizeTranscriberSegments(value: unknown) {
  if (!Array.isArray(value)) return [];
  const directGroup = value
    .map((segment) => normalizeTranscriberSegment(segment))
    .filter((segment): segment is NormalizedTranscriberSegment => Boolean(segment));
  if (directGroup.length > 0) return [directGroup];
  return value
    .map((group) => {
      if (!Array.isArray(group)) return [];
      return group
        .map((segment) => normalizeTranscriberSegment(segment))
        .filter((segment): segment is NormalizedTranscriberSegment => Boolean(segment));
    })
    .filter((group) => group.length > 0);
}

async function persistCompletedJob(jobId: string, sessionUserId: string, payload: Record<string, unknown>) {
  const tabs = normalizeTabs(getFirstJobValue(payload, ["tabs"]));
  if (tabs.length === 0) return null;

  const existing = await prisma.tabJob.findFirst({
    where: {
      userId: sessionUserId,
      resultJson: {
        contains: `"backendJobId":"${jobId}"`,
      },
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const transcriberSegments = normalizeTranscriberSegments(
    getFirstJobValue(payload, ["transcriberSegments", "noteEventGroups", "segmentGroups", "segments"])
  );
  const explicitLabel =
    typeof getFirstJobValue(payload, ["sourceLabel", "source_label", "fileName", "filename", "title"]) === "string"
      ? (getFirstJobValue(payload, ["sourceLabel", "source_label", "fileName", "filename", "title"]) as string)
      : "";
  const songTitle =
    typeof getFirstJobValue(payload, ["song_title", "songTitle"]) === "string"
      ? (getFirstJobValue(payload, ["song_title", "songTitle"]) as string)
      : "";
  const artist =
    typeof getFirstJobValue(payload, ["artist"]) === "string" ? (getFirstJobValue(payload, ["artist"]) as string) : "";
  const sourceLabel = explicitLabel || [artist, songTitle].filter(Boolean).join(" - ") || `Transcription ${jobId}`;
  const durationValue = Number(getFirstJobValue(payload, ["durationSec", "duration", "duration_sec"]));

  const created = await prisma.tabJob.create({
    data: {
      userId: sessionUserId,
      sourceType:
        typeof getFirstJobValue(payload, ["sourceType", "source_type"]) === "string"
          ? String(getFirstJobValue(payload, ["sourceType", "source_type"]))
          : "TRANSCRIBE",
      sourceLabel,
      durationSec: Number.isFinite(durationValue) ? Math.max(1, Math.round(durationValue)) : null,
      resultJson: serializeStoredTabPayload({
        tabs,
        transcriberSegments,
        backendJobId: jobId,
      }),
    },
    select: { id: true },
  });

  return created.id;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const jobId = Array.isArray(req.query.job_id) ? req.query.job_id[0] : req.query.job_id;
  if (!jobId) {
    return res.status(400).json({ error: "Missing job id" });
  }

  const headers: Record<string, string> = {};
  if (BACKEND_SECRET) headers["X-Backend-Secret"] = BACKEND_SECRET;
  const session = await getServerSession(req, res, authOptions);
  if (session?.user?.id) headers["X-User-Id"] = session.user.id;

  const upstream = await fetch(`${API_BASE}/api/v1/jobs/${encodeURIComponent(jobId)}`, {
    headers,
  });
  const text = await upstream.text();
  const contentType = upstream.headers.get("content-type");
  if (!text) {
    res.status(upstream.status);
    return res.end();
  }

  if (contentType?.includes("application/json")) {
    try {
      const payload = JSON.parse(text) as Record<string, unknown>;
      const artifacts =
        getFirstJobValue(payload, ["artifacts"]) &&
        typeof getFirstJobValue(payload, ["artifacts"]) === "object" &&
        !Array.isArray(getFirstJobValue(payload, ["artifacts"]))
          ? (getFirstJobValue(payload, ["artifacts"]) as Record<string, unknown>)
          : null;
      if (artifacts && artifacts.previewAudio) {
        payload.audio_preview_url = `/api/jobs/${encodeURIComponent(jobId)}/artifacts/preview_audio`;
      }
      if (
        upstream.ok &&
        session?.user?.id &&
        typeof payload.status === "string" &&
        ["done", "completed", "succeeded", "success"].includes(payload.status.toLowerCase())
      ) {
        const tabJobId = await persistCompletedJob(jobId, session.user.id, payload);
        if (tabJobId) {
          payload.tab_job_id = tabJobId;
          payload.tabJobId = tabJobId;
        }
      }
      res.status(upstream.status);
      res.setHeader("Content-Type", "application/json");
      return res.json(payload);
    } catch {
      // Fall back to raw proxying below.
    }
  }

  res.status(upstream.status);
  if (contentType) res.setHeader("Content-Type", contentType);
  return res.send(text);
}
