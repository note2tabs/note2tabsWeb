import Link from "next/link";
import { useRouter } from "next/router";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { sendEvent } from "../lib/analytics";
import { isDevelopmentClient, isLocalNoDbClientMode } from "../lib/clientDevMode";
import { copyText } from "../lib/clipboard";
import { buildDevCreditsSummary, type CreditsSummary } from "../lib/credits";
import { buildLaneEditorRef, gteApi, type TranscriberSegmentGroup } from "../lib/gteApi";
import { GTE_GUEST_EDITOR_ID } from "../lib/gteGuestDraft";
import { tabSegmentsToStamps } from "../lib/tabTextToStamps";
import SeoHead, { SITE_NAME, SITE_URL, absoluteUrl } from "../components/SeoHead";

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

export default function HomePage() {
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
  const [selectedSegments, setSelectedSegments] = useState<Set<number>>(new Set());
  const [pricingBusy, setPricingBusy] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [showInstrumentPrompt, setShowInstrumentPrompt] = useState(false);
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
    setYtStartInput(value);
    setError(null);
    const parsed = parseTimestampInput(value);
    if (parsed === null) {
      setYtStartTime(null);
      return;
    }
    setYtStartTime(parsed);
  };

  const handleYtEndInputChange = (value: string) => {
    setYtEndInput(value);
    setError(null);
    const parsed = parseTimestampInput(value);
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
    const nextEnd = Math.min(
      Math.min(MAX_YT_END_SEC, nextStart + MAX_YT_SNIPPET_SEC),
      Math.max(nextStart + 1, ytEndTime)
    );
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
    : mode === "YOUTUBE"
    ? "Download & generate tabs"
    : "Generate tabs";
  const buildTranscribingStatusLabel = (separateGuitar: boolean) =>
    separateGuitar ? "Separating guitar and transcribing audio..." : "Transcribing audio...";
  const buildYoutubeTranscribingStatusLabel = (separateGuitar: boolean) =>
    separateGuitar
      ? "Downloading YouTube audio, separating guitar, and transcribing..."
      : "Downloading YouTube audio and transcribing...";

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setMode("FILE");
    setError(null);
    setImportError(null);
    setTabsResult(null);
    setShowInstrumentPrompt(false);
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
      setShowInstrumentPrompt(false);
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
    await router.push(`/gte/${GTE_GUEST_EDITOR_ID}?source=transcriber`);
  };

  const getSelectedTranscriberSegmentGroups = () => {
    if (!transcriberSegments || transcriberSegments.length === 0) return null;
    const indexes =
      selectedSegments.size > 0
        ? Array.from(selectedSegments).sort((a, b) => a - b)
        : transcriberSegments.map((_, idx) => idx);
    const groups = indexes
      .map((idx) => transcriberSegments[idx])
      .filter((group): group is TranscriberSegmentGroup => Array.isArray(group) && group.length > 0);
    return groups.length > 0 ? groups : null;
  };

  const validateConvertInputs = () => {
    if (!transcriberSession && !disableDbInDev) {
      setError("Sign in to start transcribing.");
      signIn(undefined, { callbackUrl: "/" });
      return false;
    }
    if (transcriberSession && !canUseUnverifiedTranscription) {
      setError("Please verify your email to continue using the transcriber.");
      return false;
    }

    if (mode === "FILE" && !selectedFile) {
      setError("Please select an audio file to transcribe.");
      return false;
    }

    if (mode === "YOUTUBE" && !youtubeValid) {
      setError("Please paste a valid YouTube link.");
      return false;
    }
    if (mode === "YOUTUBE" && (ytStartTime === null || ytEndTime === null)) {
      setError("Start time and end time are required for YouTube download.");
      return false;
    }
    if (mode === "YOUTUBE" && ytStartTime !== null && ytEndTime !== null && ytEndTime <= ytStartTime) {
      setError("End time must be after start time.");
      return false;
    }
    if (
      mode === "YOUTUBE" &&
      ytStartTime !== null &&
      ytEndTime !== null &&
      ytEndTime - ytStartTime > MAX_YT_SNIPPET_SEC
    ) {
      setError(`Time window must be ${MAX_YT_SNIPPET_SEC} seconds or less.`);
      return false;
    }

    if (mode === "FILE" && selectedFile) {
      const maxBytes = isPremiumRole(transcriberSession?.user?.role)
        ? MAX_PREMIUM_BYTES
        : MAX_FREE_BYTES;
      if (selectedFile.size > maxBytes) {
        setError(`File is too large. Max size is ${formatMb(maxBytes)} for your plan.`);
        return false;
      }
    }

    if (mode === "FILE" && fileDuration !== null && fileDuration <= 0) {
      setError("Duration must be greater than 0.");
      return false;
    }
    if (mode === "YOUTUBE") {
      if (ytStartTime !== null && ytStartTime < 0) {
        setError("Start time must be 0 or greater.");
        return false;
      }
      if (ytStartTime !== null && ytStartTime > MAX_YT_START_SEC) {
        setError("Start time must be 9:00 or earlier.");
        return false;
      }
      if (ytEndTime !== null && ytEndTime <= 0) {
        setError("End time must be greater than 0.");
        return false;
      }
      if (ytEndTime !== null && ytEndTime > MAX_YT_END_SEC) {
        setError("End time must be 10:00 or earlier.");
        return false;
      }
    }
    return true;
  };

  const startConvert = async (separateGuitar: boolean) => {
    if (convertInFlightRef.current || loading) return;
    const transcribingStatusLabel = buildTranscribingStatusLabel(separateGuitar);
    const youtubeTranscribingStatusLabel = buildYoutubeTranscribingStatusLabel(separateGuitar);

    convertInFlightRef.current = true;
    setShowInstrumentPrompt(false);
    setError(null);
    setImportError(null);
    setTabsResult(null);
    setTranscriberSegments(null);
    setStatus(mode === "FILE" ? "Uploading audio..." : "Preparing YouTube download...");
    setLoading(true);
    sendEvent("transcribe_start", { mode, ytUrl: youtubeUrl || undefined });

    try {
      let response: Response | null = null;
      if (mode === "FILE" && selectedFile) {
        const postFileDirectly = async () => {
          const fd = new FormData();
          fd.append("mode", "FILE");
          if (fileDuration !== null) {
            fd.append("duration", String(fileDuration));
          }
          fd.append("separateGuitar", separateGuitar ? "true" : "false");
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
        };
        if (shouldDeferEditorSync) payload.skipAutoEditorSync = true;
        response = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!response) {
        throw new Error("Upload failed before transcription could start.");
      }

      const data = (await response.json().catch(() => ({}))) as { error?: string } & TabsResponse;
      if (response.status === 202 && data.jobId) {
        if (data.credits) {
          setCredits(data.credits);
        }
        if (data.unverifiedTranscriptionUsed) {
          setLocalUnverifiedTranscriptionUsed(true);
        }
        setStatus("Getting things started. Opening progress screen...");
        sendEvent("transcribe_queued", { mode, jobId: data.jobId, status: data.status || "queued" });
        const jobParams = new URLSearchParams();
        jobParams.set("mode", mode);
        jobParams.set("separateGuitar", separateGuitar ? "1" : "0");
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
        setSelectedSegments(new Set());
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
            setStatus("Tabs ready. Select tab blocks below.");
            return;
          }
          setTabsResult(nextTabs);
          setStatus("Tabs ready.");
          return;
        }
        setTabsResult(nextTabs);
        setStatus("Tabs ready. Import into your editor below.");
        return;
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
      sendEvent("transcribe_error", { mode, error: err?.message || "unknown" });
    } finally {
      setLoading(false);
      convertInFlightRef.current = false;
    }
  };

  const handleConvert = () => {
    if (convertInFlightRef.current || loading) return;
    if (!validateConvertInputs()) return;
    setError(null);
    setShowInstrumentPrompt(true);
  };

  const handleInstrumentChoice = (includesOtherInstruments: boolean) => {
    void startConvert(includesOtherInstruments);
  };

  const handleImportToEditor = async () => {
    if (!tabsResult || importBusy) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const selectedTranscriberGroups = getSelectedTranscriberSegmentGroups();
      if (selectedTranscriberGroups) {
        const targetEditorId = editorChoice;
        const imported = await gteApi.importTranscriberToSaved({
          target: !targetEditorId || targetEditorId === "new" ? "new" : "existing",
          editorId:
            targetEditorId && targetEditorId !== "new"
              ? targetEditorId
              : undefined,
          segmentGroups: selectedTranscriberGroups,
        });
        await router.push(`/gte/${imported.editorId}`);
        return;
      }
      const segmentsToUse =
        selectedSegments.size > 0
          ? tabsResult.filter((_, idx) => selectedSegments.has(idx))
          : tabsResult;
      const { stamps, totalFrames } = tabSegmentsToStamps(segmentsToUse);
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
      await router.push(`/gte/${targetEditorId}`);
    } catch (err: any) {
      setImportError(err?.message || "Failed to import tabs.");
    } finally {
      setImportBusy(false);
    }
  };

  const handleOpenGuestEditor = async () => {
    if (!tabsResult || importBusy) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const selectedTranscriberGroups = getSelectedTranscriberSegmentGroups();
      if (selectedTranscriberGroups) {
        const imported = await gteApi.importTranscriberToGuest({
          segmentGroups: selectedTranscriberGroups,
          editorId: GTE_GUEST_EDITOR_ID,
        });
        await router.push(`/gte/${imported.editorId}?source=transcriber`);
        return;
      }
      const segmentsToUse =
        selectedSegments.size > 0
          ? tabsResult.filter((_, idx) => selectedSegments.has(idx))
          : tabsResult;
      await openTabsInGuestEditor(segmentsToUse);
    } catch (err: any) {
      setImportError(err?.message || "Failed to open the guest editor.");
    } finally {
      setImportBusy(false);
    }
  };

  const handlePricingClick = async () => {
    if (pricingBusy) return;
    if (!session) {
      signIn(undefined, { callbackUrl: "/" });
      return;
    }
    setPricingBusy(true);
    setPricingError(null);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        setPricingError(data?.error || "Could not start checkout.");
        return;
      }
      window.location.href = data.url;
    } catch (err: any) {
      setPricingError(err?.message || "Could not start checkout.");
    } finally {
      setPricingBusy(false);
    }
  };

  const preventEnterSubmit = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  };
  const creditsSummaryLabel = displayedCredits ? String(displayedCredits.remaining) : "0";
  const creditsResetDate = isSignedIn && displayedCredits ? new Date(displayedCredits.resetAt) : null;
  const creditsResetLabel =
    creditsResetDate && !Number.isNaN(creditsResetDate.getTime()) ? creditsResetDate.toLocaleDateString() : "";
  const creditsDaysUntilReset =
    creditsResetDate && !Number.isNaN(creditsResetDate.getTime())
      ? Math.max(0, Math.ceil((creditsResetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;
  const showCreditsEmpty = displayedCredits && displayedCredits.remaining === 0;
  const homeJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: absoluteUrl("/logo01black.png"),
      sameAs: [
        "https://instagram.com/note2tabs",
        "https://tiktok.com/@note2tabs",
        "https://youtube.com/@note2tabs",
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "MusicApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      description:
        "Convert audio files and YouTube links into editable guitar tabs in the browser.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
  ];

  return (
    <>
      <SeoHead
        title="Note2Tabs | Convert Audio and YouTube to Guitar Tabs"
        description="Convert audio files or YouTube links into playable guitar tabs online. Upload a song, generate tabs, and refine them in the browser."
        canonicalPath="/"
        jsonLd={homeJsonLd}
      />
      <main className="page page-home">
        <section className="hero hero--landing-funnel" id="hero">
          <div className="container hero-stack hero-stack--centered">
            <div className="hero-heading" data-reveal>
              <div className="hero-title-row">
                <h1 className="hero-title">Convert Any Song to Tabs</h1>
              </div>
            </div>
            <form
              id="transcriber-start"
              className="prompt-shell prompt-shell--funnel"
              data-reveal
              onKeyDown={preventEnterSubmit}
            >
              <div className="prompt-meta-row">
                <span className="funnel-external-label">{mode === "YOUTUBE" ? "YouTube URL" : ""}</span>
                {isSignedIn && displayedCredits && (
                  <p className="hero-credits-inline">
                    Credits: <strong>{creditsSummaryLabel}</strong>
                    {isSignedIn && creditsDaysUntilReset !== null && (
                      <span className="hero-credits-next">
                        {creditsDaysUntilReset === 0
                          ? "• Next credits today"
                          : `• Next credits in ${creditsDaysUntilReset} day${
                              creditsDaysUntilReset === 1 ? "" : "s"
                            }`}
                      </span>
                    )}
                  </p>
                )}
              </div>

              {showInstrumentPrompt ? (
                <div className="instrument-prompt">
                  <p className="instrument-question">Does your audio include other instruments?</p>
                  <div className="button-row instrument-choice-row">
                    <button
                      type="button"
                      className="button-secondary instrument-choice-button"
                      onClick={() => handleInstrumentChoice(true)}
                      disabled={loading}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className="button-secondary instrument-choice-button"
                      onClick={() => handleInstrumentChoice(false)}
                      disabled={loading}
                    >
                      No
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="funnel-panel">
                    <div className="funnel-row">
                      <div
                        className={`funnel-input ${mode === "FILE" ? "is-file" : "is-url"} ${
                          dragActive ? "active" : ""
                        }`}
                        onDrop={mode === "FILE" ? onDrop : undefined}
                        onDragOver={mode === "FILE" ? onDragOver : undefined}
                        onDragEnter={mode === "FILE" ? onDragEnter : undefined}
                        onDragLeave={mode === "FILE" ? onDragLeave : undefined}
                      >
                        <span className="funnel-icon" aria-hidden="true">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5.5v13l10-6.5-10-6.5z" />
                          </svg>
                        </span>
                        {mode === "FILE" ? (
                          <span className="funnel-file-label">
                            {selectedFile ? selectedFile.name : "Upload audio file or drop it here"}
                          </span>
                        ) : (
                          <input
                            type="url"
                            value={youtubeUrl}
                            onChange={(event) => setYoutubeUrl(event.target.value)}
                            placeholder="https://www.youtube.com/..."
                          />
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept={AUDIO_ACCEPT}
                          className="native-file-input"
                          aria-label="Choose audio file"
                          disabled={mode !== "FILE" || loading}
                          onChange={onFileChange}
                        />
                      </div>
                    </div>
                    <div className="funnel-toolbar">
                      <div className="mode-switch mode-switch--hero" role="tablist" aria-label="Input mode">
                        <button
                          type="button"
                          className={mode === "FILE" ? "active" : ""}
                          onClick={() => {
                            setMode("FILE");
                            setShowInstrumentPrompt(false);
                          }}
                        >
                          Audio file
                        </button>
                        <button
                          type="button"
                          className={mode === "YOUTUBE" ? "active" : ""}
                          onClick={() => {
                            setMode("YOUTUBE");
                            setShowInstrumentPrompt(false);
                          }}
                        >
                          YouTube link
                        </button>
                      </div>
                      <button
                        type="button"
                        className="button-primary funnel-submit"
                        disabled={!canSubmit}
                        onClick={() => void handleConvert()}
                      >
                        {loading ? submitLabel : "Convert to Tabs"}
                      </button>
                    </div>
                  </div>

                  {mode === "YOUTUBE" && (
                    <div className="prompt-field prompt-field--compact">
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
                            onBlur={handleYtEndInputBlur}
                            required
                          />
                        </label>
                        <p className="advanced-note">Max length is 30 s.</p>
                      </div>
                    </div>
                  )}
                </>
              )}

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
                  <p>Pick the tab blocks you want to import or copy.</p>
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
                        onClick={() => void handleImportToEditor()}
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
                      onClick={() => void handleOpenGuestEditor()}
                      disabled={importBusy}
                    >
                      {importBusy ? "Opening..." : "Open in guest editor"}
                    </button>
                  )}
                  <button
                    type="button"
                    className={!isSignedIn ? "button-primary" : "button-secondary"}
                    onClick={() => {
                      const segmentsToUse =
                        selectedSegments.size > 0
                          ? tabsResult.filter((_, idx) => selectedSegments.has(idx))
                          : tabsResult;
                      void copyText(segmentsToUse.map((segment) => segment.join("\n")).join("\n\n---\n\n"));
                    }}
                  >
                    Copy tabs
                  </button>
                  {isSignedIn ? (
                    <Link href="/settings" className="button-secondary">
                      Open settings
                    </Link>
                  ) : disableDbInDev ? (
                    <Link href={`/gte/${GTE_GUEST_EDITOR_ID}`} className="button-secondary">
                      Open guest editor
                    </Link>
                  ) : (
                    <Link href="/settings" className="button-secondary">
                      Open settings
                    </Link>
                  )}
                </div>
              </div>
              {importError && <div className="error">{importError}</div>}
              <div className="results-grid">
                {tabsResult.map((segment, idx) => {
                  const selected = selectedSegments.has(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() =>
                        setSelectedSegments((prev) => {
                          const next = new Set(prev);
                          if (next.has(idx)) {
                            next.delete(idx);
                          } else {
                            next.add(idx);
                          }
                          return next;
                        })
                      }
                      className={`tab-block text-left transition ${
                        selected ? "ring-2 ring-emerald-400/80 bg-emerald-50/60" : ""
                      }`}
                    >
                      <pre className="tab-block-content">{segment.join("\n")}</pre>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        <section className="steps" id="how">
          <div className="container">
            <h2 className="section-title" data-reveal>
              How it works
            </h2>
            <div className="how-flow" data-reveal>
              <article className="how-step">
                <span className="how-step-index">1</span>
                <h3>Transcribe</h3>
                <p>Upload music or paste a youtube link to start transcribing</p>
              </article>


              <article className="how-step">
                <span className="how-step-index">2</span>
                <h3>Fine-Tune</h3>
                <p>Tune the transcription settings until the notes sound right</p>
              </article>


              <article className="how-step">
                <span className="how-step-index">3</span>
                <h3>Tabs</h3>
                <p>You can edit the tabs or optimize the guitar fingerings to your liking, using the editor.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="pricing" id="pricing">
          <div className="container">
            <div className="pricing-grid">
              <div className="pricing-card pricing-card--free" data-reveal>
                <div className="pricing-header">
                  <span className="pill">Free</span>
                  <div className="pricing-price">
                    <span className="pricing-amount">$0</span>
                    <span className="pricing-interval">/ month</span>
                  </div>
                </div>
                <ul className="pricing-list">
                  <li>10 credits per month</li>
                  <li>Upload size: 50 MB</li>
                  <li>Youtube length: 30s</li>
                  <li>Standard speed</li>
                </ul>
              </div>
              <button
                type="button"
                className="pricing-card pricing-card--premium pricing-card--trial"
                data-reveal
                onClick={handlePricingClick}
                disabled={pricingBusy}
              >
                <span className="pricing-trial-ribbon">7 days free trial</span>
                <div className="pricing-header">
                  <span className="pill">Premium</span>
                  <div className="pricing-price">
                    <span className="pricing-amount">$5.99</span>
                    <span className="pricing-interval">/ month</span>
                  </div>
                </div>
                <ul className="pricing-list">
                  <li>50 credits per month (with rollover)</li>
                  <li>Upload size: 200 MB</li>
                  <li>Youtube length: unlimited</li>
                  <li>Extra speed</li>
                </ul>
              </button>
            </div>
            {pricingError && <div className="error">{pricingError}</div>}
          </div>
        </section>

        <section className="bottom-transcriber" data-reveal>
          <div className="container">
            <div className="bottom-transcriber-shell">
              <h2 className="bottom-transcriber-title">Ready to convert audio to tabs?</h2>
              <div className="bottom-transcriber-actions">
                <Link href="#hero" className="button-primary">
                  Start transcribing
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
