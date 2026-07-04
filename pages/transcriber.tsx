import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { ANALYTICS_EVENTS, sendEvent } from "../lib/analytics";
import { isDevelopmentClient, isLocalNoDbClientMode } from "../lib/clientDevMode";
import { buildDevCreditsSummary, type CreditsSummary } from "../lib/credits";
import { buildLaneEditorRef, gteApi, type TranscriberSegmentGroup } from "../lib/gteApi";
import { GTE_GUEST_EDITOR_ID } from "../lib/gteGuestDraft";
import { tabSegmentsToStamps } from "../lib/tabTextToStamps";
import {
  DEFAULT_TRANSCRIPTION_MODEL,
  type TranscriptionModelChoice,
} from "../lib/transcriptionModels";
import SeoHead, { SITE_NAME, absoluteUrl } from "../components/SeoHead";
import TranscriptionModelDropdown from "../components/TranscriptionModelDropdown";

type TabsResponse = {
  tabs: string[][];
  transcriberSegments?: TranscriberSegmentGroup[];
  tokensRemaining?: number;
  credits?: CreditsSummary;
  jobId?: string;
  tabJobId?: string;
  status?: string;
  gteEditorId?: string;
  verificationRequired?: boolean;
  unverifiedTranscriptionUsed?: boolean;
};
type CreditsResponse = {
  credits?: CreditsSummary;
};
const isPremiumRole = (role?: string) =>
  role === "PREMIUM" || role === "ADMIN" || role === "MODERATOR" || role === "MOD";
const MAX_FREE_BYTES = 50 * 1024 * 1024;
const MAX_PREMIUM_BYTES = 200 * 1024 * 1024;
const AUDIO_ACCEPT = "audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.webm";

const formatMb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

const MAX_YT_SNIPPET_SEC = 30;
const MAX_YT_START_SEC = 9 * 60;
const MAX_YT_END_SEC = 10 * 60;
const YOUTUBE_DOWNLOAD_DISABLED = true;
const YOUTUBE_DOWNLOAD_OUTAGE_MESSAGE =
  "YouTube downloads are temporarily unavailable. Our developers are working on a fix.";

const isYouTubeId = (value: string) => /^[a-zA-Z0-9_-]{11}$/.test(value);

const formatTimestamp = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const parseTimestampInput = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(?::\d{1,2})?$/.test(trimmed)) return null;
  if (!trimmed.includes(":")) {
    const seconds = Number(trimmed);
    return Number.isNaN(seconds) ? null : seconds;
  }
  const [minutesPart, secondsPart] = trimmed.split(":");
  const minutes = Number(minutesPart);
  const seconds = Number(secondsPart);
  if (Number.isNaN(minutes) || Number.isNaN(seconds) || seconds > 59) {
    return null;
  }
  return minutes * 60 + seconds;
};

const preserveTimestampColon = (value: string, previousValue: string) => {
  if (!previousValue.includes(":")) return value;
  return value.includes(":") ? value : previousValue;
};

const preventTimestampColonDelete = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key !== "Backspace" && event.key !== "Delete") return;
  const input = event.currentTarget;
  const colonIndex = input.value.indexOf(":");
  if (colonIndex === -1 || input.selectionStart === null || input.selectionEnd === null) return;
  const { selectionStart, selectionEnd } = input;
  const deletesColon =
    selectionStart !== selectionEnd
      ? selectionStart <= colonIndex && selectionEnd > colonIndex
      : (event.key === "Backspace" && selectionStart === colonIndex + 1) ||
        (event.key === "Delete" && selectionStart === colonIndex);
  if (deletesColon) {
    event.preventDefault();
  }
};

const parseYouTubeId = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace("www.", "");
    if (host === "youtu.be") {
      const id = url.pathname.replace("/", "");
      return isYouTubeId(id) ? id : null;
    }
    if (host.endsWith("youtube.com")) {
      const idParam = url.searchParams.get("v");
      if (idParam && isYouTubeId(idParam)) return idParam;
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "embed" || parts[0] === "shorts") {
        const id = parts[1];
        return isYouTubeId(id) ? id : null;
      }
    }
  } catch {
    if (isYouTubeId(trimmed)) return trimmed;
  }
  return null;
};

export default function TranscriberPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<"FILE" | "YOUTUBE">("FILE");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [ytStartTime, setYtStartTime] = useState<number | null>(null);
  const [ytEndTime, setYtEndTime] = useState<number | null>(null);
  const [ytStartInput, setYtStartInput] = useState("0:00");
  const [ytEndInput, setYtEndInput] = useState(formatTimestamp(MAX_YT_SNIPPET_SEC));
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [separateGuitar, setSeparateGuitar] = useState(true);
  const [multipleGuitars, setMultipleGuitars] = useState(false);
  const [transcriptionModel, setTranscriptionModel] =
    useState<TranscriptionModelChoice>(DEFAULT_TRANSCRIPTION_MODEL);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tabsResult, setTabsResult] = useState<string[][] | null>(null);
  const [transcriberSegments, setTranscriberSegments] = useState<TranscriberSegmentGroup[] | null>(null);
  const [credits, setCredits] = useState<CreditsSummary | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [editorChoices, setEditorChoices] = useState<
    Array<{ id: string; name?: string; updatedAt?: string }>
  >([]);
  const [editorChoice, setEditorChoice] = useState<string>("new");
  const [editorLoading, setEditorLoading] = useState(false);
  const [localUnverifiedTranscriptionUsed, setLocalUnverifiedTranscriptionUsed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounter = useRef(0);
  const convertInFlightRef = useRef(false);
  const disableDbInDev = isLocalNoDbClientMode;
  const transcriberSession = session ?? null;
  const isSignedIn = Boolean(transcriberSession);
  const requireVerifiedEmail = process.env.NODE_ENV === "production";
  const isEmailVerified = !requireVerifiedEmail || Boolean(transcriberSession?.user?.isEmailVerified);
  const unverifiedTranscriptionUsed =
    localUnverifiedTranscriptionUsed || Boolean(transcriberSession?.user?.unverifiedTranscriptionUsed);
  const canUseUnverifiedTranscription = !requireVerifiedEmail || isEmailVerified || !unverifiedTranscriptionUsed;
  const displayedCredits = useMemo(
    () => credits ?? (disableDbInDev ? buildDevCreditsSummary() : null),
    [credits, disableDbInDev]
  );
  const verifyHref = `/auth/verify-email${
    transcriberSession?.user?.email
      ? `?email=${encodeURIComponent(transcriberSession.user.email)}`
      : ""
  }`;
  const appendEditorId = useMemo(() => {
    if (!router.isReady) return null;
    const value = router.query.appendEditorId;
    if (Array.isArray(value)) {
      return value[0] ? value[0].trim() : null;
    }
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }, [router.isReady, router.query.appendEditorId]);
  const editorChoicesForSelect = useMemo(() => {
    if (!appendEditorId || editorChoices.some((editor) => editor.id === appendEditorId)) {
      return editorChoices;
    }
    return [{ id: appendEditorId, name: "Current editor" }, ...editorChoices];
  }, [appendEditorId, editorChoices]);
  const youtubeId = useMemo(() => parseYouTubeId(youtubeUrl), [youtubeUrl]);
  const resolvedYtDuration = useMemo(() => {
    if (ytStartTime === null || ytEndTime === null) return 0;
    const rawDuration = ytEndTime - ytStartTime;
    return Math.min(MAX_YT_SNIPPET_SEC, Math.max(1, rawDuration));
  }, [ytStartTime, ytEndTime]);
  const youtubeTimeRangeValid = useMemo(() => {
    if (ytStartTime === null || ytEndTime === null) return false;
    if (ytStartTime < 0 || ytStartTime > MAX_YT_START_SEC) return false;
    if (ytEndTime <= 0 || ytEndTime > MAX_YT_END_SEC) return false;
    if (ytEndTime <= ytStartTime) return false;
    if (ytEndTime - ytStartTime > MAX_YT_SNIPPET_SEC) return false;
    return true;
  }, [ytStartTime, ytEndTime]);
  const shouldDeferEditorSync = Boolean(appendEditorId);

  useEffect(() => {
    setLocalUnverifiedTranscriptionUsed(Boolean(session?.user?.unverifiedTranscriptionUsed));
    if (session?.user?.monthlyCreditsUsed !== undefined) {
      setCredits({
        used: session.user.monthlyCreditsUsed ?? 0,
        limit: session.user.monthlyCreditsLimit ?? 0,
        remaining: session.user.monthlyCreditsRemaining ?? 0,
        resetAt: session.user.monthlyCreditsResetAt || new Date().toISOString(),
        unlimited: Boolean(session.user.monthlyCreditsUnlimited),
      });
    }
    if (!session?.user?.id || disableDbInDev) return;
    let cancelled = false;
    fetch("/api/credits", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: CreditsResponse | null) => {
        if (!cancelled && data?.credits) {
          setCredits(data.credits);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session, disableDbInDev]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const elements = document.querySelectorAll("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("visible");
        });
      },
      { threshold: 0.2 }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (appendEditorId) {
      setEditorChoice(appendEditorId);
    }
  }, [appendEditorId]);

  useEffect(() => {
    if (!tabsResult || !isSignedIn) return;
    setEditorLoading(true);
    gteApi
      .listEditors()
      .then((data) => {
        const editors = (data.editors || []).map((editor) => ({
          id: editor.id,
          name: editor.name,
          updatedAt: editor.updatedAt,
        }));
        setEditorChoices(editors);
        if (appendEditorId) {
          setEditorChoice(appendEditorId);
        } else {
          setEditorChoice("new");
        }
      })
      .catch(() => {
        setEditorChoices([]);
      })
      .finally(() => {
        setEditorLoading(false);
      });
  }, [tabsResult, isSignedIn, appendEditorId]);

  useEffect(() => {
    if (mode !== "YOUTUBE") return;
    if (ytStartTime === null) {
      setYtStartTime(0);
      setYtStartInput("0:00");
    }
    if (ytEndTime === null) {
      setYtEndTime(MAX_YT_SNIPPET_SEC);
      setYtEndInput(formatTimestamp(MAX_YT_SNIPPET_SEC));
    }
  }, [mode]);

  const handleYtStartInputChange = (value: string) => {
    const nextValue = preserveTimestampColon(value, ytStartInput);
    setYtStartInput(nextValue);
    setError(null);
    const parsed = parseTimestampInput(nextValue);
    if (parsed === null) {
      setYtStartTime(null);
      return;
    }
    setYtStartTime(parsed);
  };

  const handleYtEndInputChange = (value: string) => {
    const nextValue = preserveTimestampColon(value, ytEndInput);
    setYtEndInput(nextValue);
    setError(null);
    const parsed = parseTimestampInput(nextValue);
    if (parsed === null) {
      setYtEndTime(null);
      return;
    }
    setYtEndTime(parsed);
  };

  const handleYtStartInputBlur = () => {
    if (ytStartTime === null) {
      setYtStartInput("");
      return;
    }
    const nextStart = Math.min(MAX_YT_START_SEC, Math.max(0, ytStartTime));
    setYtStartTime(nextStart);
    setYtStartInput(formatTimestamp(nextStart));
    if (ytEndTime === null) return;
    const maxEnd = Math.min(MAX_YT_END_SEC, nextStart + MAX_YT_SNIPPET_SEC);
    const nextEnd = ytEndTime <= nextStart ? maxEnd : Math.min(maxEnd, ytEndTime);
    setYtEndTime(nextEnd);
    setYtEndInput(formatTimestamp(nextEnd));
  };

  const handleYtEndInputBlur = () => {
    if (ytEndTime === null) {
      setYtEndInput("");
      return;
    }
    const minEnd = ytStartTime !== null ? ytStartTime + 1 : 1;
    const maxEnd = ytStartTime !== null ? Math.min(MAX_YT_END_SEC, ytStartTime + MAX_YT_SNIPPET_SEC) : MAX_YT_END_SEC;
    const nextEnd = Math.min(maxEnd, Math.max(minEnd, ytEndTime));
    setYtEndTime(nextEnd);
    setYtEndInput(formatTimestamp(nextEnd));
  };

  const youtubeValid = useMemo(() => Boolean(youtubeId), [youtubeId]);

  const canSubmit = useMemo(() => {
    if (isSignedIn && !canUseUnverifiedTranscription) return false;
    if (mode === "FILE") return Boolean(selectedFile) && !loading;
    if (YOUTUBE_DOWNLOAD_DISABLED) return false;
    return youtubeValid && youtubeTimeRangeValid && !loading;
  }, [
    mode,
    selectedFile,
    youtubeValid,
    youtubeTimeRangeValid,
    loading,
    isSignedIn,
    canUseUnverifiedTranscription,
  ]);
  const submitLabel = loading
    ? mode === "YOUTUBE"
      ? "Downloading..."
      : "Generating..."
    : mode === "YOUTUBE" && YOUTUBE_DOWNLOAD_DISABLED
    ? "YouTube unavailable"
    : mode === "YOUTUBE"
    ? "Generate tabs"
    : "Generate tabs";
  const transcribingStatusLabel = separateGuitar
    ? "Separating guitar and transcribing audio..."
    : "Transcribing audio...";
  const youtubeTranscribingStatusLabel = separateGuitar
    ? "Downloading YouTube audio, separating guitar, and transcribing..."
    : "Downloading YouTube audio and transcribing...";

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setMode("FILE");
    setError(null);
    setImportError(null);
    setTabsResult(null);
  };

  const onDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragCounter.current += 1;
    setDragActive(true);
  };

  const onDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      setDragActive(false);
    }
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragCounter.current = 0;
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      setMode("FILE");
      setError(null);
      setImportError(null);
      setTabsResult(null);
    }
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const openTabsInGuestEditor = async (segments: string[][]) => {
    const { stamps, totalFrames } = tabSegmentsToStamps(segments);
    if (stamps.length === 0) {
      throw new Error("No tabs available to import into the guest editor.");
    }
    const guestLaneEditorId = buildLaneEditorRef(GTE_GUEST_EDITOR_ID, "ed-1");
    await gteApi.deleteEditor(GTE_GUEST_EDITOR_ID).catch(() => {});
    await gteApi.importTab(guestLaneEditorId, { stamps, totalFrames });
    return GTE_GUEST_EDITOR_ID;
  };

  const getSelectedTranscriberSegmentGroups = () => {
    if (!transcriberSegments || transcriberSegments.length === 0) return null;
    const groups = transcriberSegments
      .filter((group): group is TranscriberSegmentGroup => Array.isArray(group) && group.length > 0);
    return groups.length > 0 ? groups : null;
  };

  const handleConvert = async () => {
    if (convertInFlightRef.current || loading) return;

    if (!transcriberSession && !disableDbInDev) {
      setError("Sign in to start transcribing.");
      signIn(undefined, { callbackUrl: "/" });
      return;
    }
    if (transcriberSession && !canUseUnverifiedTranscription) {
      setError("Please verify your email to continue using the transcriber.");
      return;
    }

    if (mode === "FILE" && !selectedFile) {
      setError("Please select an audio file to transcribe.");
      return;
    }

    if (mode === "YOUTUBE" && !youtubeValid) {
      setError("Please paste a valid YouTube link.");
      return;
    }
    if (mode === "YOUTUBE" && YOUTUBE_DOWNLOAD_DISABLED) {
      setError(YOUTUBE_DOWNLOAD_OUTAGE_MESSAGE);
      return;
    }
    if (mode === "YOUTUBE" && (ytStartTime === null || ytEndTime === null)) {
      setError("Start time and end time are required for YouTube download.");
      return;
    }
    if (mode === "YOUTUBE" && ytStartTime !== null && ytEndTime !== null && ytEndTime <= ytStartTime) {
      setError("End time must be after start time.");
      return;
    }
    if (
      mode === "YOUTUBE" &&
      ytStartTime !== null &&
      ytEndTime !== null &&
      ytEndTime - ytStartTime > MAX_YT_SNIPPET_SEC
    ) {
      setError(`Time window must be ${MAX_YT_SNIPPET_SEC} seconds or less.`);
      return;
    }

    if (mode === "FILE" && selectedFile) {
      const maxBytes = isPremiumRole(transcriberSession?.user?.role)
        ? MAX_PREMIUM_BYTES
        : MAX_FREE_BYTES;
      if (selectedFile.size > maxBytes) {
        setError(`File is too large. Max size is ${formatMb(maxBytes)} for your plan.`);
        return;
      }
    }

    if (mode === "FILE" && fileDuration !== null && fileDuration <= 0) {
      setError("Duration must be greater than 0.");
      return;
    }
    if (mode === "YOUTUBE") {
      if (ytStartTime !== null && ytStartTime < 0) {
        setError("Start time must be 0 or greater.");
        return;
      }
      if (ytStartTime !== null && ytStartTime > MAX_YT_START_SEC) {
        setError("Start time must be 9:00 or earlier.");
        return;
      }
      if (ytEndTime !== null && ytEndTime <= 0) {
        setError("End time must be greater than 0.");
        return;
      }
      if (ytEndTime !== null && ytEndTime > MAX_YT_END_SEC) {
        setError("End time must be 10:00 or earlier.");
        return;
      }
    }

    convertInFlightRef.current = true;
    setError(null);
    setImportError(null);
    setTabsResult(null);
    setTranscriberSegments(null);
    setStatus(mode === "FILE" ? transcribingStatusLabel : "Preparing YouTube...");
    setLoading(true);
    sendEvent("transcribe_start", { mode, ytUrl: youtubeUrl || undefined });

    try {
      let response: Response;
      if (mode === "FILE" && selectedFile) {
        const postFileDirectly = async () => {
          const fd = new FormData();
          fd.append("mode", "FILE");
          if (fileDuration !== null) {
            fd.append("duration", String(fileDuration));
          }
          fd.append("separateGuitar", separateGuitar ? "true" : "false");
          fd.append("multipleGuitars", multipleGuitars ? "true" : "false");
          fd.append("transcriptionModel", transcriptionModel);
          if (shouldDeferEditorSync) {
            fd.append("skipAutoEditorSync", "true");
          }
          fd.append("file", selectedFile);
          setStatus(transcribingStatusLabel);
          return await fetch("/api/transcribe", { method: "POST", body: fd });
        };

        if (isDevelopmentClient) {
          response = await postFileDirectly();
        } else {
          const uploadStorageError = "Could not upload file to storage. Please try again.";
          const presignRes = await fetch("/api/uploads/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: selectedFile.name,
              contentType: selectedFile.type || "application/octet-stream",
              size: selectedFile.size,
            }),
          });
          const presignData = await presignRes.json().catch(() => ({}));
          if (!presignRes.ok || !presignData?.url || !presignData?.key) {
            throw new Error(presignData?.error || uploadStorageError);
          } else {
            try {
              const uploadRes = await fetch(presignData.url, {
                method: "PUT",
                headers: { "Content-Type": selectedFile.type || "application/octet-stream" },
                body: selectedFile,
              });
              if (!uploadRes.ok) {
                throw new Error(uploadStorageError);
              }
            } catch {
              throw new Error(uploadStorageError);
            }
            setStatus(transcribingStatusLabel);
            const payload: Record<string, unknown> = {
              mode: "FILE",
              s3Key: presignData.key,
              fileName: selectedFile.name,
              separateGuitar,
              multipleGuitars,
              transcriptionModel,
            };
            if (fileDuration !== null) payload.duration = fileDuration;
            if (shouldDeferEditorSync) payload.skipAutoEditorSync = true;
            response = await fetch("/api/transcribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          }
        }
      } else {
        setStatus(youtubeTranscribingStatusLabel);
        const payload: Record<string, unknown> = {
          mode: "YOUTUBE",
          youtubeUrl: youtubeUrl.trim(),
          startTime: Math.max(0, ytStartTime ?? 0),
          duration: resolvedYtDuration,
          separateGuitar,
          multipleGuitars,
          transcriptionModel,
        };
        if (shouldDeferEditorSync) payload.skipAutoEditorSync = true;
        response = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = (await response.json().catch(() => ({}))) as { error?: string } & TabsResponse;
      if (response.status === 202 && data.jobId) {
        if (data.credits) {
          setCredits(data.credits);
        }
        if (data.unverifiedTranscriptionUsed) {
          setLocalUnverifiedTranscriptionUsed(true);
        }
        setStatus("Opening progress screen...");
        sendEvent("transcribe_queued", { mode, jobId: data.jobId, status: data.status || "queued" });
        const jobParams = new URLSearchParams();
        jobParams.set("mode", mode);
        jobParams.set("separateGuitar", separateGuitar ? "1" : "0");
        jobParams.set("multipleGuitars", multipleGuitars ? "1" : "0");
        jobParams.set("model", transcriptionModel);
        if (appendEditorId) {
          jobParams.set("appendEditorId", appendEditorId);
        }
        await router.push(
          jobParams.toString() ? `/job/${data.jobId}?${jobParams.toString()}` : `/job/${data.jobId}`
        );
        return;
      }
      if (!response.ok) {
        if (data.credits) {
          setCredits(data.credits);
        }
        if (data.verificationRequired) {
          setLocalUnverifiedTranscriptionUsed(true);
          setError("Please verify your email to continue using the transcriber.");
          return;
        }
        setError(data?.error || "Transcription failed. Please try again.");
        sendEvent("transcribe_error", { mode, error: data?.error || "unknown" });
        return;
      }
      if (!data.tabs || !Array.isArray(data.tabs)) {
        setError("No tabs returned from server.");
        sendEvent("transcribe_error", { mode, error: "no tabs" });
        return;
      }
      const nextTabs = data.tabs;
      setTranscriberSegments(Array.isArray(data.transcriberSegments) ? data.transcriberSegments : null);
      if (data.credits) {
        setCredits(data.credits);
      }
      if (data.unverifiedTranscriptionUsed) {
        setLocalUnverifiedTranscriptionUsed(true);
      }
      sendEvent("transcribe_success", { mode, jobId: data.jobId });
      if (transcriberSession && data.tabJobId) {
        setStatus("Tabs ready. Opening transcription...");
        await router.push(
          appendEditorId
            ? `/tabs/${data.tabJobId}?appendEditorId=${encodeURIComponent(appendEditorId)}`
            : `/tabs/${data.tabJobId}`
        );
        return;
      }
      if (!transcriberSession) {
        if (disableDbInDev) {
          setTabsResult(nextTabs);
          setStatus("Tabs ready. Select blocks below.");
          return;
        }
        setTabsResult(nextTabs);
        setStatus("Tabs ready.");
        return;
      }
      setTabsResult(nextTabs);
      setStatus("Tabs ready. Import below.");
      return;
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
      sendEvent("transcribe_error", { mode, error: err?.message || "unknown" });
    } finally {
      setLoading(false);
      convertInFlightRef.current = false;
    }
  };

  const handleImportToEditor = async (quantize: boolean) => {
    if (!tabsResult || importBusy) return;
    setImportBusy(true);
    setImportError(null);
    const selectedTranscriberGroups = getSelectedTranscriberSegmentGroups();
    const target = !editorChoice || editorChoice === "new" ? "new" : "existing";
    const importFormat = selectedTranscriberGroups ? "segment_groups" : "tab_stamps";
    const eventProperties = {
      target,
      import_format: importFormat,
      selection: "all",
      mode,
      source: "transcriber",
      quantize,
    };
    sendEvent(ANALYTICS_EVENTS.transcriptionEditorImportStarted, eventProperties);
    try {
      if (selectedTranscriberGroups) {
        const targetEditorId = editorChoice;
        const imported = await gteApi.importTranscriberToSaved({
          target: !targetEditorId || targetEditorId === "new" ? "new" : "existing",
          editorId:
            targetEditorId && targetEditorId !== "new"
              ? targetEditorId
              : undefined,
          segmentGroups: selectedTranscriberGroups,
          quantize,
        });
        sendEvent(ANALYTICS_EVENTS.transcriptionImportedToEditor, {
          ...eventProperties,
          editor_id: imported.editorId,
        });
        await router.push(`/gte/${imported.editorId}`);
        return;
      }
      const { stamps, totalFrames } = tabSegmentsToStamps(tabsResult);
      if (stamps.length === 0) {
        setImportError("No tabs available to import.");
        return;
      }
      let targetEditorId = editorChoice;
      if (!targetEditorId || targetEditorId === "new") {
        const created = await gteApi.createEditor();
        targetEditorId = created.editorId;
      }
      await gteApi.appendImportTab(targetEditorId, { stamps, totalFrames });
      sendEvent(ANALYTICS_EVENTS.transcriptionImportedToEditor, {
        ...eventProperties,
        editor_id: targetEditorId,
      });
      await router.push(`/gte/${targetEditorId}`);
    } catch (err: any) {
      const message = err?.message || "Failed to import tabs.";
      setImportError(message);
      sendEvent(ANALYTICS_EVENTS.transcriptionEditorImportFailed, {
        ...eventProperties,
        error: message,
      });
    } finally {
      setImportBusy(false);
    }
  };

  const handleOpenGuestEditor = async (quantize: boolean) => {
    if (!tabsResult || importBusy) return;
    setImportBusy(true);
    setImportError(null);
    const selectedTranscriberGroups = getSelectedTranscriberSegmentGroups();
    const importFormat = selectedTranscriberGroups ? "segment_groups" : "tab_stamps";
    const eventProperties = {
      target: "guest",
      import_format: importFormat,
      selection: "all",
      mode,
      source: "transcriber",
      quantize,
    };
    sendEvent(ANALYTICS_EVENTS.transcriptionEditorImportStarted, eventProperties);
    try {
      if (selectedTranscriberGroups) {
        const imported = await gteApi.importTranscriberToGuest({
          segmentGroups: selectedTranscriberGroups,
          editorId: GTE_GUEST_EDITOR_ID,
          quantize,
        });
        sendEvent(ANALYTICS_EVENTS.transcriptionImportedToEditor, {
          ...eventProperties,
          editor_id: imported.editorId,
        });
        await router.push(`/gte/${imported.editorId}?source=transcriber`);
        return;
      }
      const editorId = await openTabsInGuestEditor(tabsResult);
      sendEvent(ANALYTICS_EVENTS.transcriptionImportedToEditor, {
        ...eventProperties,
        editor_id: editorId,
      });
      await router.push(`/gte/${editorId}?source=transcriber`);
    } catch (err: any) {
      const message = err?.message || "Failed to open the guest editor.";
      setImportError(message);
      sendEvent(ANALYTICS_EVENTS.transcriptionEditorImportFailed, {
        ...eventProperties,
        error: message,
      });
    } finally {
      setImportBusy(false);
    }
  };

  const preventEnterSubmit = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  };
  const creditsUsageLabel = displayedCredits
    ? `${displayedCredits.remaining}/${displayedCredits.limit}`
    : transcriberSession || disableDbInDev
    ? "-"
    : "10";
  const creditsResetLabel = displayedCredits ? new Date(displayedCredits.resetAt).toLocaleDateString() : "";
  const showCreditsEmpty = displayedCredits && displayedCredits.remaining === 0;
  const resetLabelText = isPremiumRole(transcriberSession?.user?.role) ? "Next credits" : "Resets";
  const transcriberDescription =
    "Upload audio or enter a YouTube segment to generate a draft guitar tab you can refine.";
  const transcriberJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Note2Tabs Transcriber",
      applicationCategory: "MusicApplication",
      operatingSystem: "Web",
      url: absoluteUrl("/transcribe"),
      description: transcriberDescription,
      provider: {
        "@type": "Organization",
        name: SITE_NAME,
      },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: absoluteUrl("/"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Transcriber",
          item: absoluteUrl("/transcribe"),
        },
      ],
    },
  ];

  return (
    <>
      <SeoHead
        title="Audio to Guitar Tab Transcriber | Note2Tabs"
        description={transcriberDescription}
        canonicalPath="/transcribe"
        jsonLd={transcriberJsonLd}
      />

      <main className="page page-home">
        <section className="hero" id="hero">
          <div className="hero-glow hero-glow--one" aria-hidden="true" />
          <div className="hero-glow hero-glow--two" aria-hidden="true" />
          <div className="container hero-stack hero-stack--centered">
            <div className="hero-heading" data-reveal>
              <div className="hero-title-row">
                <h1 className="hero-title">Transcriber</h1>
              </div>
              <p className="hero-subtitle">
                Upload audio or enter a YouTube segment and get a draft tab you can refine in the editor.
              </p>
              <div className="button-row hero-cta-row">
                <Link href="/gte" className="button-primary">
                  Open Guitar Tab Editor
                </Link>
                <Link href="/" className="button-secondary">
                  Back to home
                </Link>
              </div>
            </div>
            <form className="prompt-shell" data-reveal onKeyDown={preventEnterSubmit}>
              {displayedCredits && (
                <div className="prompt-top prompt-top--solo">
                  <div className="prompt-balance">
                    <span>Credits</span>
                    <strong>{creditsUsageLabel}</strong>
                    <span className="prompt-reset">
                      {resetLabelText} {creditsResetLabel}
                    </span>
                  </div>
                </div>
              )}

              <div className="mode-switch" role="tablist" aria-label="Input mode">
                <button
                  type="button"
                  className={mode === "FILE" ? "active" : ""}
                  onClick={() => setMode("FILE")}
                >
                  Audio file
                </button>
                <button
                  type="button"
                  className={mode === "YOUTUBE" ? "active" : ""}
                  onClick={() => setMode("YOUTUBE")}
                >
                  YouTube link
                </button>
              </div>

              <div className="prompt-field">
                {mode === "FILE" ? (
                  <div
                    className={`dropzone ${dragActive ? "active" : ""}`}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onDragEnter={onDragEnter}
                    onDragLeave={onDragLeave}
                  >
                    <div className="dropzone-text">
                      <strong>{selectedFile ? "Audio attached" : "Drag audio here"}</strong>
                      <span>{selectedFile ? selectedFile.name : "Click to browse or drop a file."}</span>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={AUDIO_ACCEPT}
                      className="native-file-input"
                      aria-label="Choose audio file"
                      disabled={loading}
                      onChange={onFileChange}
                    />
                  </div>
                ) : (
                  <label className="url-field">
                    <span>YouTube URL</span>
                    <input
                      type="url"
                      value={youtubeUrl}
                      onChange={(event) => setYoutubeUrl(event.target.value)}
                      placeholder="https://www.youtube.com/..."
                    />
                  </label>
                )}

                {mode === "YOUTUBE" && (
                  <div className="youtube-outage-notice" role="status">
                    {YOUTUBE_DOWNLOAD_OUTAGE_MESSAGE}
                  </div>
                )}

                <div className="transcriber-checkbox-row">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={separateGuitar}
                      onChange={(event) => setSeparateGuitar(event.target.checked)}
                      disabled={loading}
                    />
                    <span>Does your audio include other instruments?</span>
                  </label>
                </div>
                <div className="transcriber-checkbox-row">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={multipleGuitars}
                      onChange={(event) => setMultipleGuitars(event.target.checked)}
                      disabled={loading}
                    />
                    <span>Does your audio include more than one guitar?</span>
                  </label>
                </div>
                <div className="model-choice">
                  <TranscriptionModelDropdown
                    id="transcriber-transcription-model"
                    value={transcriptionModel}
                    onChange={setTranscriptionModel}
                    disabled={loading}
                  />
                </div>
              </div>

              {mode === "YOUTUBE" && (
                <div className="advanced-grid">
                  <label>
                    Start time
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9:]*"
                      autoComplete="off"
                      placeholder="0:00"
                      value={ytStartInput}
                      onChange={(event) => handleYtStartInputChange(event.target.value)}
                      onKeyDown={preventTimestampColonDelete}
                      onBlur={handleYtStartInputBlur}
                      required
                    />
                  </label>
                  <label>
                    End time
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9:]*"
                      autoComplete="off"
                      placeholder="0:30"
                      value={ytEndInput}
                      onChange={(event) => handleYtEndInputChange(event.target.value)}
                      onKeyDown={preventTimestampColonDelete}
                      onBlur={handleYtEndInputBlur}
                      required
                    />
                  </label>
                  <p className="advanced-note">Max length is 30 s.</p>
                </div>
              )}

              <div className="prompt-actions">
                <button
                  type="button"
                  className="button-primary"
                  disabled={!canSubmit}
                  onClick={() => void handleConvert()}
                >
                  {submitLabel}
                </button>
              </div>

              {status && <div className="status">{status}</div>}
              {error && <div className="error">{error}</div>}
              {isSignedIn && !isEmailVerified && !canUseUnverifiedTranscription && (
                <div className="notice">
                  Verify your email to continue using the transcriber.{" "}
                  <Link href={verifyHref} className="button-link">
                    Verify now
                  </Link>
                </div>
              )}
              {isSignedIn && showCreditsEmpty && (
                <div className="notice">
                  {isPremiumRole(transcriberSession?.user?.role)
                    ? `Credits used. Next credits arrive on ${creditsResetLabel}.`
                    : `Monthly credits used. Upgrade to Premium or wait until ${creditsResetLabel}.`}
                </div>
              )}
            </form>

          </div>
        </section>

        {tabsResult && (
          <section className="results" id="results">
            <div className="container results-shell">
              <div className="results-header">
                <div>
                  <h2>Your tabs are ready</h2>
                  <p>Choose where to open the transcription.</p>
                </div>
                <div className="results-actions">
                  {isSignedIn && (
                    <div className="button-row">
                      <select
                        className="form-select button-small"
                        value={editorChoice}
                        onChange={(event) => setEditorChoice(event.target.value)}
                        disabled={editorLoading}
                      >
                        <option value="new">New editor</option>
                        {editorChoicesForSelect.map((editor) => (
                          <option key={editor.id} value={editor.id}>
                            {editor.name || "Untitled"}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="button-primary"
                        onClick={() => void handleImportToEditor(false)}
                        disabled={importBusy || editorLoading}
                      >
                        {importBusy ? "Importing..." : "Import to editor"}
                      </button>
                    </div>
                  )}
                  {!isSignedIn && disableDbInDev && (
                    <button
                      type="button"
                      className="button-primary"
                      onClick={() => void handleOpenGuestEditor(false)}
                      disabled={importBusy}
                    >
                      {importBusy ? "Opening..." : "Open in guest editor"}
                    </button>
                  )}
                </div>
              </div>
              {importError && <div className="error">{importError}</div>}
            </div>
          </section>
        )}
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: "/transcribe",
    permanent: true,
  },
});
