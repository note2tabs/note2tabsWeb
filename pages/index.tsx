import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { ANALYTICS_EVENTS, sendEvent, trackCtaClick } from "../lib/analytics";
import { isDevelopmentClient, isLocalNoDbClientMode } from "../lib/clientDevMode";
import { buildDevCreditsSummary, type CreditsSummary } from "../lib/credits";
import { buildLaneEditorRef, gteApi, type TranscriberSegmentGroup } from "../lib/gteApi";
import { GTE_GUEST_EDITOR_ID } from "../lib/gteGuestDraft";
import { tabSegmentsToStamps } from "../lib/tabTextToStamps";
import {
  DEFAULT_TRANSCRIPTION_MODEL,
  type TranscriptionModelChoice,
} from "../lib/transcriptionModels";
import {
  DEFAULT_FILE_SNIPPET_SEC,
  MAX_FREE_FILE_SNIPPET_SEC,
  clampFileClipEnd,
  clampFileClipStart,
  getDefaultFileClipRange,
  isFileClipRangeValid,
} from "../lib/transcriptionClip";
import SeoHead, { SITE_NAME, SITE_URL, absoluteUrl } from "../components/SeoHead";
import TranscriptionModelDropdown from "../components/TranscriptionModelDropdown";
import TranscriptionStartStatus from "../components/TranscriptionStartStatus";
import { normalizeUploadFilename } from "../lib/uploadFilename";
import {
  clearPendingTranscription,
  peekPendingTranscription,
  savePendingTranscription,
} from "../lib/pendingTranscription";
import {
  clearRecoverableCheckoutSessionId,
  confirmPremiumCheckout,
  getRecoverableCheckoutSessionId,
  hideCheckoutSessionIdFromAddressBar,
  waitForPremiumEntitlement,
} from "../lib/premiumEntitlement";
import {
  analyticsHttpStatusClass,
  categorizeAnalyticsError,
} from "../lib/analyticsErrors";

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
const HOW_STEP_DURATION_MS = 4000;

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

const getAudioFileDuration = (file: File): Promise<number | null> =>
  new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : null;
      cleanup();
      resolve(duration);
    };
    audio.onerror = () => {
      cleanup();
      resolve(null);
    };
    audio.src = url;
  });

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
  const { data: session, status: sessionStatus, update: updateSession } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<"FILE" | "YOUTUBE">("FILE");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [ytStartTime, setYtStartTime] = useState<number | null>(null);
  const [ytEndTime, setYtEndTime] = useState<number | null>(null);
  const [ytStartInput, setYtStartInput] = useState("0:00");
  const [ytEndInput, setYtEndInput] = useState(formatTimestamp(MAX_YT_SNIPPET_SEC));
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [fileStartTime, setFileStartTime] = useState<number | null>(0);
  const [fileEndTime, setFileEndTime] = useState<number | null>(DEFAULT_FILE_SNIPPET_SEC);
  const [fileStartInput, setFileStartInput] = useState("0:00");
  const [fileEndInput, setFileEndInput] = useState(formatTimestamp(DEFAULT_FILE_SNIPPET_SEC));
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
  const [pricingBusy, setPricingBusy] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [authHandoffBusy, setAuthHandoffBusy] = useState(false);
  const [showInstrumentPrompt, setShowInstrumentPrompt] = useState(false);
  const [includesOtherInstruments, setIncludesOtherInstruments] = useState<boolean | null>(null);
  const [transcriptionModel, setTranscriptionModel] =
    useState<TranscriptionModelChoice>(DEFAULT_TRANSCRIPTION_MODEL);
  const [multipleGuitars, setMultipleGuitars] = useState<boolean | null>(null);
  const [localUnverifiedTranscriptionUsed, setLocalUnverifiedTranscriptionUsed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounter = useRef(0);
  const convertInFlightRef = useRef(false);
  const authHandoffInFlightRef = useRef(false);
  const resumeHandoffAttemptRef = useRef(0);
  const disableDbInDev = isLocalNoDbClientMode;
  const transcriberSession = session ?? null;
  const isSignedIn = Boolean(transcriberSession);
  const isPremiumUser = isPremiumRole(transcriberSession?.user?.role);
  const isStaffUser = ["ADMIN", "MODERATOR", "MOD"].includes(transcriberSession?.user?.role || "");
  const needsPremiumForSelectedFile = Boolean(
    transcriberSession && !isPremiumUser && selectedFile && selectedFile.size > MAX_FREE_BYTES
  );
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
  const resolvedFileDuration = useMemo(() => {
    if (fileStartTime === null || fileEndTime === null) return 0;
    return Math.max(1, fileEndTime - fileStartTime);
  }, [fileStartTime, fileEndTime]);
  const fileTimeRangeValid = useMemo(() => {
    if (!selectedFile) return false;
    return isFileClipRangeValid(fileStartTime, fileEndTime, fileDuration, isPremiumUser);
  }, [fileDuration, fileEndTime, fileStartTime, isPremiumUser, selectedFile]);
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

  useEffect(() => {
    if (!router.isReady || router.query.mode !== "youtube") return;
    setMode("YOUTUBE");
  }, [router.isReady, router.query.mode]);

  const applyFileClipDefaults = (duration: number | null) => {
    const nextRange = getDefaultFileClipRange(duration, isPremiumUser);
    setFileStartTime(nextRange.start);
    setFileStartInput("0:00");
    setFileEndTime(nextRange.end);
    setFileEndInput(formatTimestamp(nextRange.end));
  };

  const selectAudioFile = (file: File | null) => {
    setSelectedFile(file);
    setFileDuration(null);
    applyFileClipDefaults(null);
    if (!file) return;
    void getAudioFileDuration(file).then((duration) => {
      setFileDuration(duration);
      applyFileClipDefaults(duration);
    });
  };

  useEffect(() => {
    if (!router.isReady || sessionStatus !== "authenticated") return;
    if (router.query.resumeTranscription !== "1") return;
    const attemptId = resumeHandoffAttemptRef.current + 1;
    resumeHandoffAttemptRef.current = attemptId;
    let cancelled = false;

    const restorePendingTranscription = async () => {
      const pending = await peekPendingTranscription();
      if (cancelled || resumeHandoffAttemptRef.current !== attemptId) return;
      if (!pending) {
        setError("Your saved upload expired or could not be restored. Please choose it again to continue.");
        await router.replace("/#hero", undefined, { shallow: true });
        return;
      }

      const returnedFromBilling =
        router.query.upgrade === "success" || router.query.upgrade === "manage";
      const requiresPremium = pending.mode === "FILE" && pending.file.size > MAX_FREE_BYTES;
      let premiumEntitlementReady = isPremiumUser;
      const checkoutSessionIdValue = router.query.session_id;
      const checkoutSessionIdFromQuery = Array.isArray(checkoutSessionIdValue)
        ? checkoutSessionIdValue[0]
        : checkoutSessionIdValue;
      if (returnedFromBilling) hideCheckoutSessionIdFromAddressBar();
      const checkoutSessionId =
        router.query.upgrade === "success"
          ? typeof checkoutSessionIdFromQuery === "string"
            ? checkoutSessionIdFromQuery
            : getRecoverableCheckoutSessionId()
          : null;

      if (returnedFromBilling && requiresPremium && !premiumEntitlementReady) {
        setError(null);
        setStatus("Payment received. Activating Premium and restoring your upload…");
        if (typeof checkoutSessionId === "string") {
          await confirmPremiumCheckout(checkoutSessionId);
        }
        if (cancelled || resumeHandoffAttemptRef.current !== attemptId) return;
        premiumEntitlementReady = await waitForPremiumEntitlement(
          () => updateSession(),
          {
            shouldStop: () => cancelled || resumeHandoffAttemptRef.current !== attemptId,
          }
        );
        if (cancelled || resumeHandoffAttemptRef.current !== attemptId) return;
        if (!premiumEntitlementReady) {
          setStatus(null);
          setError(
            "Premium is still activating. Your upload is safe—reload this page to retry."
          );
          return;
        }
        clearRecoverableCheckoutSessionId();
      } else if (returnedFromBilling && premiumEntitlementReady) {
        clearRecoverableCheckoutSessionId();
      }

      setError(null);
      setShowInstrumentPrompt(false);
      if (pending.mode === "FILE") {
        setMode("FILE");
        setSelectedFile(pending.file);
        setFileDuration(null);
        setFileStartTime(pending.fileStartTime);
        setFileStartInput(formatTimestamp(pending.fileStartTime));
        setFileEndTime(pending.fileEndTime);
        setFileEndInput(formatTimestamp(pending.fileEndTime));
        const duration = await getAudioFileDuration(pending.file);
        if (cancelled || resumeHandoffAttemptRef.current !== attemptId) return;
        setFileDuration(duration);
      } else {
        setMode("YOUTUBE");
        setYoutubeUrl(pending.youtubeUrl);
        setYtStartTime(pending.startTime);
        setYtStartInput(formatTimestamp(pending.startTime));
        setYtEndTime(pending.endTime);
        setYtEndInput(formatTimestamp(pending.endTime));
      }

      if (pending.mode === "FILE" && pending.file.size > MAX_PREMIUM_BYTES) {
        setError(`The restored file exceeds the ${formatMb(MAX_PREMIUM_BYTES)} upload limit.`);
        setStatus("Choose a smaller audio file to continue.");
      } else if (requiresPremium && !premiumEntitlementReady) {
        setStatus("Your upload is restored. Upgrade to Premium to transcribe this file.");
      } else if (!canUseUnverifiedTranscription) {
        setError("Please verify your email to continue using the transcriber.");
        setStatus("Your upload is restored and will remain available after verification.");
      } else {
        setShowInstrumentPrompt(true);
        setStatus("Welcome back — your transcription is ready to continue.");
      }

      sendEvent(ANALYTICS_EVENTS.authHandoffResumed, { mode: pending.mode, path: "/" });
      await router.replace("/#hero", undefined, { shallow: true });
    };

    void restorePendingTranscription()
      .catch(() => {
        if (!cancelled) setError("You are signed in. Please choose the audio again to continue.");
      });

    return () => {
      cancelled = true;
    };
  }, [router.isReady, router.query.resumeTranscription, sessionStatus]);

  useEffect(() => {
    if (!selectedFile || fileDuration === null || fileStartTime !== 0 || fileEndTime === null) return;
    const fileLength = Math.max(1, Math.ceil(fileDuration));
    const freeDefaultEnd = Math.min(fileLength, MAX_FREE_FILE_SNIPPET_SEC);
    if (isPremiumUser && fileEndTime === freeDefaultEnd && fileLength > freeDefaultEnd) {
      setFileEndTime(fileLength);
      setFileEndInput(formatTimestamp(fileLength));
      return;
    }
    if (!isPremiumUser && fileEndTime > freeDefaultEnd) {
      setFileEndTime(freeDefaultEnd);
      setFileEndInput(formatTimestamp(freeDefaultEnd));
    }
  }, [fileDuration, fileEndTime, fileStartTime, isPremiumUser, selectedFile]);

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

  const handleFileStartInputChange = (value: string) => {
    const nextValue = preserveTimestampColon(value, fileStartInput);
    setFileStartInput(nextValue);
    setError(null);
    const parsed = parseTimestampInput(nextValue);
    if (parsed === null) {
      setFileStartTime(null);
      return;
    }
    const nextRange = clampFileClipStart(parsed, fileEndTime, fileDuration, isPremiumUser);
    setFileStartTime(nextRange.start);
    if (nextRange.start !== parsed) {
      setFileStartInput(formatTimestamp(nextRange.start));
    }
    setFileEndTime(nextRange.end);
    setFileEndInput(formatTimestamp(nextRange.end));
  };

  const handleFileEndInputChange = (value: string) => {
    const nextValue = preserveTimestampColon(value, fileEndInput);
    setFileEndInput(nextValue);
    setError(null);
    const parsed = parseTimestampInput(nextValue);
    if (parsed === null) {
      setFileEndTime(null);
      return;
    }
    const nextEnd = clampFileClipEnd(fileStartTime, parsed, fileDuration, isPremiumUser);
    setFileEndTime(nextEnd);
    if (nextEnd !== parsed) {
      setFileEndInput(formatTimestamp(nextEnd));
    }
  };

  const handleFileStartInputBlur = () => {
    if (fileStartTime === null) {
      setFileStartInput("");
      return;
    }
    const nextRange = clampFileClipStart(fileStartTime, fileEndTime, fileDuration, isPremiumUser);
    setFileStartTime(nextRange.start);
    setFileStartInput(formatTimestamp(nextRange.start));
    setFileEndTime(nextRange.end);
    setFileEndInput(formatTimestamp(nextRange.end));
  };

  const handleFileEndInputBlur = () => {
    if (fileEndTime === null) {
      setFileEndInput("");
      return;
    }
    const nextEnd = clampFileClipEnd(fileStartTime, fileEndTime, fileDuration, isPremiumUser);
    setFileEndTime(nextEnd);
    setFileEndInput(formatTimestamp(nextEnd));
  };

  const youtubeValid = useMemo(() => Boolean(youtubeId), [youtubeId]);

  const canSubmit = useMemo(() => {
    if (sessionStatus === "loading" || (isSignedIn && !canUseUnverifiedTranscription)) return false;
    if (mode === "FILE") return Boolean(selectedFile) && fileTimeRangeValid && !loading && !authHandoffBusy;
    if (YOUTUBE_DOWNLOAD_DISABLED) return false;
    return youtubeValid && youtubeTimeRangeValid && !loading && !authHandoffBusy;
  }, [
    mode,
    selectedFile,
    fileTimeRangeValid,
    youtubeValid,
    youtubeTimeRangeValid,
    loading,
    authHandoffBusy,
    isSignedIn,
    canUseUnverifiedTranscription,
    sessionStatus,
  ]);
  const submitLabel = authHandoffBusy
    ? "Opening sign in…"
    : loading
    ? mode === "YOUTUBE"
      ? "Downloading..."
      : "Generating..."
    : mode === "FILE" && !selectedFile
    ? "Choose audio file"
    : mode === "YOUTUBE" && YOUTUBE_DOWNLOAD_DISABLED
    ? "YouTube unavailable"
    : mode === "YOUTUBE"
    ? "Generate tabs"
    : "Generate tabs";
  const buildTranscribingStatusLabel = (separateGuitar: boolean) =>
    separateGuitar ? "Separating guitar and transcribing audio..." : "Transcribing audio...";
  const buildYoutubeTranscribingStatusLabel = (separateGuitar: boolean) =>
    separateGuitar
      ? "Downloading YouTube audio, separating guitar, and transcribing..."
      : "Downloading YouTube audio and transcribing...";

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    selectAudioFile(file);
    if (file) {
      sendEvent(ANALYTICS_EVENTS.uploadSelected, {
        mode: "FILE",
        size: file.size,
        type: file.type || "unknown",
      });
    }
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
      selectAudioFile(file);
      sendEvent(ANALYTICS_EVENTS.uploadDropped, {
        mode: "FILE",
        size: file.size,
        type: file.type || "unknown",
      });
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
    const groups = transcriberSegments
      .filter((group): group is TranscriberSegmentGroup => Array.isArray(group) && group.length > 0);
    return groups.length > 0 ? groups : null;
  };

  const validateConvertInputs = () => {
    if (!transcriberSession && !disableDbInDev) {
      setError("Sign in to start transcribing.");
      sendEvent(ANALYTICS_EVENTS.uploadValidationFailed, { reason: "signed_out", mode });
      signIn(undefined, { callbackUrl: "/" });
      return false;
    }
    if (transcriberSession && !canUseUnverifiedTranscription) {
      setError("Please verify your email to continue using the transcriber.");
      sendEvent(ANALYTICS_EVENTS.uploadValidationFailed, { reason: "email_unverified", mode });
      return false;
    }

    if (mode === "FILE" && !selectedFile) {
      setError("Please select an audio file to transcribe.");
      sendEvent(ANALYTICS_EVENTS.uploadValidationFailed, { reason: "missing_file", mode });
      return false;
    }

    if (mode === "YOUTUBE" && !youtubeValid) {
      setError("Please paste a valid YouTube link.");
      sendEvent(ANALYTICS_EVENTS.uploadValidationFailed, { reason: "invalid_youtube_url", mode });
      return false;
    }
    if (mode === "YOUTUBE" && YOUTUBE_DOWNLOAD_DISABLED) {
      setError(YOUTUBE_DOWNLOAD_OUTAGE_MESSAGE);
      sendEvent(ANALYTICS_EVENTS.uploadValidationFailed, { reason: "youtube_downloader_unavailable", mode });
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
        sendEvent(ANALYTICS_EVENTS.uploadValidationFailed, {
          reason: "file_too_large",
          mode,
          size: selectedFile.size,
          maxBytes,
        });
        return false;
      }
    }

    if (mode === "FILE" && selectedFile && !fileTimeRangeValid) {
      setError("Selected file clip must be greater than 0 and within the file length.");
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
    sendEvent(ANALYTICS_EVENTS.tabGenerationStarted, {
      mode,
      sourceType: mode,
      separateGuitar,
      multipleGuitars,
      transcriptionModel,
      fileSize: selectedFile?.size,
      durationSec: mode === "YOUTUBE" ? resolvedYtDuration : resolvedFileDuration,
      hasAppendEditorId: Boolean(appendEditorId),
    });

    try {
      let response: Response | null = null;
      if (mode === "FILE" && selectedFile) {
        const uploadFileName = normalizeUploadFilename(selectedFile.name);
        const postFileDirectly = async () => {
          const fd = new FormData();
          fd.append("mode", "FILE");
          fd.append("startTime", String(Math.max(0, fileStartTime ?? 0)));
          fd.append("duration", String(resolvedFileDuration));
          fd.append("separateGuitar", separateGuitar ? "true" : "false");
          fd.append("multipleGuitars", multipleGuitars ? "true" : "false");
          fd.append("transcriptionModel", transcriptionModel);
          if (shouldDeferEditorSync) {
            fd.append("skipAutoEditorSync", "true");
          }
          fd.append("file", selectedFile, uploadFileName);
          setStatus(transcribingStatusLabel);
          return await fetch("/api/transcribe", { method: "POST", body: fd });
        };

        if (isDevelopmentClient) {
          response = await postFileDirectly();
        } else {
          const uploadStorageError = "Could not upload file to storage. Please try again.";
          sendEvent(ANALYTICS_EVENTS.uploadPresignStarted, { mode, size: selectedFile.size });
          const presignRes = await fetch("/api/uploads/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: uploadFileName,
              contentType: selectedFile.type || "application/octet-stream",
              size: selectedFile.size,
            }),
          });
          const presignData = await presignRes.json().catch(() => ({}));
          if (!presignRes.ok || !presignData?.url || !presignData?.key) {
            sendEvent(ANALYTICS_EVENTS.uploadStorageFailed, {
              mode,
              step: "presign",
              error_code: categorizeAnalyticsError(
                presignData?.error,
                "presign_rejected"
              ),
              http_status_class: analyticsHttpStatusClass(presignRes.status),
            });
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
              sendEvent(ANALYTICS_EVENTS.uploadStorageSucceeded, {
                mode,
                size: selectedFile.size,
                type: selectedFile.type || "unknown",
              });
            } catch {
              sendEvent(ANALYTICS_EVENTS.uploadStorageFailed, { mode, step: "storage_put" });
              throw new Error(uploadStorageError);
            }
            setStatus(transcribingStatusLabel);
            const payload: Record<string, unknown> = {
              mode: "FILE",
              s3Key: presignData.key,
              fileName: uploadFileName,
              separateGuitar,
              multipleGuitars,
              transcriptionModel,
            };
            payload.startTime = Math.max(0, fileStartTime ?? 0);
            payload.duration = resolvedFileDuration;
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

      if (!response) {
        throw new Error("Upload failed before transcription could start.");
      }

      const data = (await response.json().catch(() => ({}))) as { error?: string } & TabsResponse;
      if (response.status === 202 && data.jobId) {
        await clearPendingTranscription().catch(() => {});
        if (data.credits) {
          setCredits(data.credits);
        }
        if (data.unverifiedTranscriptionUsed) {
          setLocalUnverifiedTranscriptionUsed(true);
        }
        setStatus("Getting things started. Opening progress screen...");
        sendEvent(ANALYTICS_EVENTS.tabGenerationQueued, { mode, jobId: data.jobId, status: data.status || "queued" });
        const jobParams = new URLSearchParams();
        jobParams.set("mode", mode);
        jobParams.set("separateGuitar", separateGuitar ? "1" : "0");
        jobParams.set("multipleGuitars", multipleGuitars ? "1" : "0");
        jobParams.set("model", transcriptionModel);
        const selectedDuration = mode === "YOUTUBE" ? resolvedYtDuration : resolvedFileDuration;
        if (Number.isFinite(selectedDuration) && selectedDuration > 0) {
          jobParams.set("duration", String(Math.round(selectedDuration)));
        }
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
        sendEvent(ANALYTICS_EVENTS.tabGenerationFailed, {
          mode,
          error_code: categorizeAnalyticsError(data?.error, "transcription_failed"),
          http_status_class: analyticsHttpStatusClass(response.status),
        });
        return;
      }
      if (!data.tabs || !Array.isArray(data.tabs)) {
        setError("No tabs returned from server.");
        sendEvent(ANALYTICS_EVENTS.tabGenerationFailed, {
          mode,
          error_code: "no_tabs",
        });
        return;
      }
      const nextTabs = data.tabs;
      await clearPendingTranscription().catch(() => {});
      setTranscriberSegments(Array.isArray(data.transcriberSegments) ? data.transcriberSegments : null);
      if (data.credits) {
        setCredits(data.credits);
      }
      if (data.unverifiedTranscriptionUsed) {
        setLocalUnverifiedTranscriptionUsed(true);
      }
      sendEvent(ANALYTICS_EVENTS.tabGenerationSucceeded, {
        mode,
        jobId: data.jobId,
        tabJobId: data.tabJobId,
        segmentGroups: Array.isArray(data.transcriberSegments) ? data.transcriberSegments.length : undefined,
      });
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
          setStatus("Tabs ready.");
          return;
        }
        setTabsResult(nextTabs);
        setStatus("Tabs ready.");
        return;
      }
      setTabsResult(nextTabs);
      setStatus("Tabs ready. Choose an editor below.");
      return;
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
      sendEvent(ANALYTICS_EVENTS.tabGenerationFailed, {
        mode,
        error_code: categorizeAnalyticsError(err, "transcription_failed"),
      });
    } finally {
      setLoading(false);
      convertInFlightRef.current = false;
    }
  };

  const handleConvert = async () => {
    if (convertInFlightRef.current || authHandoffInFlightRef.current || loading) return;
    if (sessionStatus === "loading") {
      setStatus("Checking your account…");
      return;
    }
    if (!transcriberSession && !disableDbInDev) {
      if (mode === "FILE" && selectedFile && selectedFile.size > MAX_PREMIUM_BYTES) {
        setError(`Files over ${formatMb(MAX_PREMIUM_BYTES)} cannot be preserved through sign-in.`);
        sendEvent(ANALYTICS_EVENTS.uploadValidationFailed, {
          reason: "file_too_large",
          mode,
          size: selectedFile.size,
          maxBytes: MAX_PREMIUM_BYTES,
        });
        return;
      }
      authHandoffInFlightRef.current = true;
      setAuthHandoffBusy(true);
      setError(null);
      setStatus("Saving your selection before sign-in…");
      try {
        await savePendingTranscription(
          mode === "FILE" && selectedFile
            ? {
                mode: "FILE",
                file: selectedFile,
                fileStartTime: Math.max(0, fileStartTime ?? 0),
                fileEndTime: Math.max(1, fileEndTime ?? DEFAULT_FILE_SNIPPET_SEC),
                savedAt: Date.now(),
              }
            : {
                mode: "YOUTUBE",
                youtubeUrl: youtubeUrl.trim(),
                startTime: Math.max(0, ytStartTime ?? 0),
                endTime: Math.max(1, ytEndTime ?? MAX_YT_SNIPPET_SEC),
                savedAt: Date.now(),
              }
        );
        sendEvent(ANALYTICS_EVENTS.uploadValidationFailed, { reason: "signed_out", mode });
        sendEvent(ANALYTICS_EVENTS.authHandoffSaved, { mode, path: "/" });
        await signIn(undefined, { callbackUrl: "/?resumeTranscription=1#hero" });
      } catch {
        setError("We could not safely preserve this audio for sign-in. Please sign in first, then choose it again.");
      } finally {
        authHandoffInFlightRef.current = false;
        setAuthHandoffBusy(false);
      }
      return;
    }
    if (!validateConvertInputs()) return;
    setError(null);
    setIncludesOtherInstruments(null);
    setMultipleGuitars(null);
    setShowInstrumentPrompt(true);
  };

  const handleHeroPrimaryAction = () => {
    if (mode === "FILE" && !selectedFile) {
      trackCtaClick("choose_audio_file", { surface: "hero_funnel" });
      fileInputRef.current?.click();
      return;
    }
    trackCtaClick("convert_to_tabs", { surface: "hero_funnel", mode });
    void handleConvert();
  };

  const instrumentPromptComplete = includesOtherInstruments !== null && multipleGuitars !== null;

  const handleInstrumentPromptStart = () => {
    if (includesOtherInstruments === null || multipleGuitars === null) return;
    if (!validateConvertInputs()) {
      setShowInstrumentPrompt(false);
      return;
    }
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
      await router.push(`/gte/${targetEditorId}`);
    } catch (err: any) {
      setImportError(err?.message || "Failed to import tabs.");
    } finally {
      setImportBusy(false);
    }
  };

  const howSteps = [
    {
      title: "Upload or paste a YouTube link",
      text: "Start with a riff, solo, rehearsal recording, or YouTube clip.",
      video: "/videos/upload.mp4",
      poster: "/videos/posters/upload-640.webp",
    },
    {
      title: "Edit your guitar tabs",
      text: "Clean up timing, adjust fingerings, and shape the result into playable tab.",
      video: "/videos/edit.mp4",
      poster: "/videos/posters/edit.jpg",
    },
    {
      title: "Practice and play",
      text: "Play it back, practice with the editor, and export when it feels right.",
      video: "/videos/play.mp4",
      poster: "/videos/posters/play.jpg",
    },
  ];

    const [activeHowStep, setActiveHowStep] = useState(0);
  const [howAutoAdvanceEnabled, setHowAutoAdvanceEnabled] = useState(true);
  const [howManualPlayNonce, setHowManualPlayNonce] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const howRef = useRef<HTMLElement | null>(null);
  const howVideoRef = useRef<HTMLVideoElement | null>(null);
  const [hasViewedHowSection, setHasViewedHowSection] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => {
      setPrefersReducedMotion(media.matches);
      if (media.matches) setHowAutoAdvanceEnabled(false);
    };
    syncPreference();
    media.addEventListener?.("change", syncPreference);
    return () => media.removeEventListener?.("change", syncPreference);
  }, []);

  useEffect(() => {
    const el = howRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasViewedHowSection(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.35,
      }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (prefersReducedMotion || !howAutoAdvanceEnabled || !hasViewedHowSection || howSteps.length === 0) return;

    const video = howVideoRef.current;
    if (!video) return;

    const handleEnded = () => {
      setActiveHowStep((prev) => {
        if (prev >= howSteps.length - 1) {
          return 0;
        }

        return prev + 1;
      });
    };

    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("ended", handleEnded);
    };
  }, [activeHowStep, hasViewedHowSection, howAutoAdvanceEnabled, howSteps.length, prefersReducedMotion]);

  useEffect(() => {
    if (!hasViewedHowSection || prefersReducedMotion) return;
    const video = howVideoRef.current;
    if (!video) return;
    if (!howAutoAdvanceEnabled && howManualPlayNonce === 0) return;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  }, [activeHowStep, hasViewedHowSection, howAutoAdvanceEnabled, howManualPlayNonce, prefersReducedMotion]);

  const handleHowStepClick = (index: number) => {
    setHowAutoAdvanceEnabled(false);
    setActiveHowStep(index);
    setHowManualPlayNonce((prev) => prev + 1);
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
      await openTabsInGuestEditor(tabsResult);
    } catch (err: any) {
      setImportError(err?.message || "Failed to open the guest editor.");
    } finally {
      setImportBusy(false);
    }
  };

  const handlePricingClick = async () => {
    if (pricingBusy) return;
    sendEvent(ANALYTICS_EVENTS.pricingCtaClicked, {
      cta: "premium_card",
      signedIn: Boolean(session),
      path: "/",
    });
    if (!session) {
      signIn(undefined, { callbackUrl: "/pricing?checkout=1" });
      return;
    }
    if (isPremiumUser) {
      await router.push(isStaffUser ? "/transcribe" : "/settings");
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
      sendEvent(ANALYTICS_EVENTS.checkoutStarted, { source: "home_pricing", plan: "premium_monthly" });
      window.location.href = data.url;
    } catch (err: any) {
      setPricingError(err?.message || "Could not start checkout.");
    } finally {
      setPricingBusy(false);
    }
  };

  const handlePreservedUploadUpgrade = async () => {
    if (!selectedFile || pricingBusy) return;
    setPricingBusy(true);
    setPricingError(null);
    try {
      await savePendingTranscription({
        mode: "FILE",
        file: selectedFile,
        fileStartTime: Math.max(0, fileStartTime ?? 0),
        fileEndTime: Math.max(1, fileEndTime ?? DEFAULT_FILE_SNIPPET_SEC),
        savedAt: Date.now(),
      });
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnTo: "/?resumeTranscription=1" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "Could not start checkout.");
      }
      sendEvent(ANALYTICS_EVENTS.checkoutStarted, {
        source: "large_upload_gate",
        plan: "premium_monthly",
      });
      window.location.assign(payload.url);
    } catch (upgradeError) {
      setPricingError(
        upgradeError instanceof Error ? upgradeError.message : "Could not start checkout."
      );
      setPricingBusy(false);
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
          <div className="hero-doodle-field" aria-hidden="true">
            <span className="hero-doodle hero-doodle--guitar" />
            <span className="hero-doodle hero-doodle--notes" />
            <span className="hero-doodle hero-doodle--fretboard" />
            <span className="hero-doodle hero-doodle--picks" />
          </div>
          <div className="container hero-stack hero-stack--centered">
            <div className="hero-heading" data-reveal>
              <p className="hero-eyebrow">AI tabs built for guitarists</p>
              <div className="hero-title-row">
                <h1 className="hero-title">Convert Any Song to Guitar Tabs</h1>
              </div>
              <p className="hero-subtitle hero-subtitle--conversion">
                Turn recordings into guitar tab you can edit, practice, and export.
              </p>
            </div>
            <form
              id="transcriber-start"
              className="prompt-shell prompt-shell--funnel"
              data-reveal
              onSubmit={(event) => {
                event.preventDefault();
                handleHeroPrimaryAction();
              }}
            >
              <div
                className={`prompt-meta-row ${
                  !showInstrumentPrompt || mode === "YOUTUBE" || (isSignedIn && displayedCredits)
                    ? ""
                    : "is-empty"
                }`}
                aria-hidden={
                  !showInstrumentPrompt || mode === "YOUTUBE" || (isSignedIn && displayedCredits)
                    ? undefined
                    : "true"
                }
              >
                <div className="prompt-meta-left">
                  {!showInstrumentPrompt && (
                    <div className="model-choice model-choice--meta">
                      <TranscriptionModelDropdown
                        id="home-transcription-model"
                        value={transcriptionModel}
                        onChange={setTranscriptionModel}
                        disabled={loading || authHandoffBusy}
                      />
                    </div>
                  )}
                </div>
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
                  <div className="instrument-choice-group">
                    <p className="instrument-question">Does your audio include other instruments?</p>
                    <div className="button-row instrument-choice-row">
                      <button
                        type="button"
                        className={`button-secondary instrument-choice-button ${
                          includesOtherInstruments === true ? "active" : ""
                        }`}
                        onClick={() => setIncludesOtherInstruments(true)}
                        aria-pressed={includesOtherInstruments === true}
                        disabled={loading || authHandoffBusy}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className={`button-secondary instrument-choice-button ${
                          includesOtherInstruments === false ? "active" : ""
                        }`}
                        onClick={() => setIncludesOtherInstruments(false)}
                        aria-pressed={includesOtherInstruments === false}
                        disabled={loading || authHandoffBusy}
                      >
                        No
                      </button>
                    </div>
                  </div>
                  <div className="instrument-choice-group">
                    <p className="instrument-question">Are there multiple guitars?</p>
                    <div className="button-row instrument-choice-row">
                      <button
                        type="button"
                        className={`button-secondary instrument-choice-button ${
                          multipleGuitars === true ? "active" : ""
                        }`}
                        onClick={() => setMultipleGuitars(true)}
                        aria-pressed={multipleGuitars === true}
                        disabled={loading || authHandoffBusy}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className={`button-secondary instrument-choice-button ${
                          multipleGuitars === false ? "active" : ""
                        }`}
                        onClick={() => setMultipleGuitars(false)}
                        aria-pressed={multipleGuitars === false}
                        disabled={loading || authHandoffBusy}
                      >
                        No
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button-primary instrument-start-button"
                    onClick={handleInstrumentPromptStart}
                    disabled={loading || !instrumentPromptComplete}
                  >
                    Start transcription
                  </button>
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
                        {(loading || authHandoffBusy) && status ? (
                          <TranscriptionStartStatus status={status} compact />
                        ) : (
                          <>
                            <span
                              className={`funnel-icon ${mode === "YOUTUBE" ? "funnel-icon--youtube" : ""}`}
                              aria-hidden="true"
                            >
                              {mode === "YOUTUBE" ? (
                                <svg className="youtube-mark" viewBox="0 0 28 20" fill="none">
                                  <path
                                    d="M27.4 3.1c-.32-1.2-1.24-2.15-2.4-2.48C22.9 0 14 0 14 0S5.1 0 3 .62C1.84.95.92 1.9.6 3.1.03 5.28.03 10 .03 10s0 4.72.57 6.9c.32 1.2 1.24 2.15 2.4 2.48C5.1 20 14 20 14 20s8.9 0 11-.62c1.16-.33 2.08-1.28 2.4-2.48.57-2.18.57-6.9.57-6.9s0-4.72-.57-6.9Z"
                                    fill="currentColor"
                                  />
                                  <path d="M11.2 14.25V5.75L18.45 10l-7.25 4.25Z" fill="#fff" />
                                </svg>
                              ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M8 5.5v13l10-6.5-10-6.5z" />
                                </svg>
                              )}
                            </span>
                            {mode === "FILE" ? (
                              <span className="funnel-file-label">
                                {selectedFile ? selectedFile.name : "Upload audio file or drop it here"}
                              </span>
                            ) : (
                              <>
                                <label className="sr-only" htmlFor="home-youtube-url">
                                  YouTube link
                                </label>
                                <input
                                  id="home-youtube-url"
                                  name="youtubeUrl"
                                  type="url"
                                  value={youtubeUrl}
                                  onChange={(event) => setYoutubeUrl(event.target.value)}
                                  placeholder="https://www.youtube.com/..."
                                />
                              </>
                            )}
                          </>
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
                      <div className="mode-switch mode-switch--hero" role="group" aria-label="Input mode">
                        <button
                          type="button"
                          className={mode === "FILE" ? "active" : ""}
                          aria-pressed={mode === "FILE"}
                          onClick={() => {
                            setMode("FILE");
                            setShowInstrumentPrompt(false);
                            trackCtaClick("mode_file", { surface: "hero_funnel" });
                          }}
                        >
                          Audio file
                        </button>
                        <button
                          type="button"
                          className={mode === "YOUTUBE" ? "active" : ""}
                          aria-pressed={mode === "YOUTUBE"}
                          onClick={() => {
                            setMode("YOUTUBE");
                            setShowInstrumentPrompt(false);
                            trackCtaClick("mode_youtube", { surface: "hero_funnel" });
                          }}
                        >
                          YouTube link
                        </button>
                      </div>
                      <button
                        type="submit"
                        className="button-primary funnel-submit"
                        disabled={
                          loading ||
                          authHandoffBusy ||
                          (mode === "YOUTUBE" && !canSubmit) ||
                          (mode === "FILE" && Boolean(selectedFile) && !canSubmit)
                        }
                      >
                        {submitLabel}
                      </button>
                    </div>
                  </div>

                  {mode === "YOUTUBE" && (
                    <div className="prompt-field prompt-field--compact">
                      <div className="youtube-outage-notice" role="status">
                        {YOUTUBE_DOWNLOAD_OUTAGE_MESSAGE}
                      </div>
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
                    </div>
                  )}
                  {mode === "FILE" && selectedFile && (
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
                            value={fileStartInput}
                            onChange={(event) => handleFileStartInputChange(event.target.value)}
                            onKeyDown={preventTimestampColonDelete}
                            onBlur={handleFileStartInputBlur}
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
                            placeholder="1:00"
                            value={fileEndInput}
                            onChange={(event) => handleFileEndInputChange(event.target.value)}
                            onKeyDown={preventTimestampColonDelete}
                            onBlur={handleFileEndInputBlur}
                            required
                          />
                        </label>
                        <p className="advanced-note">
                          {isPremiumUser ? "Pick any section within the file." : "Free file uploads are limited to 60 s."}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {status && !loading && !authHandoffBusy && <div className="status">{status}</div>}
              {error && <div className="error" role="alert">{error}</div>}
              {needsPremiumForSelectedFile && (
                <div className="notice">
                  <p>This file is safely preserved. Premium supports audio files up to 200 MB.</p>
                  <button
                    type="button"
                    className="button-primary button-small"
                    onClick={() => void handlePreservedUploadUpgrade()}
                    disabled={pricingBusy}
                  >
                    {pricingBusy ? "Opening checkout…" : "Upgrade and keep this upload"}
                  </button>
                  {pricingError && <div className="error" role="alert">{pricingError}</div>}
                </div>
              )}
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

            <div className="hero-outcome-row" data-reveal>
              <span>MP3, WAV, M4A</span>
              <span>YouTube clips</span>
              <span>Editable tab</span>
            </div>

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
                </div>
              </div>
              {importError && <div className="error">{importError}</div>}
            </div>
          </section>
        )}

        <section ref={howRef} className="steps" id="how">
          <div className="container">
            <h2 className="section-title" data-reveal>
              How it works
            </h2>

            <div className="how-lovable" data-reveal>
              <div className="how-video-card">
                <video
                  ref={howVideoRef}
                  key={`${howSteps[activeHowStep].video}-${howManualPlayNonce}`}
                  className="how-video active"
                  src={hasViewedHowSection ? howSteps[activeHowStep].video : undefined}
                  poster={howSteps[activeHowStep].poster}
                  autoPlay={
                    !prefersReducedMotion &&
                    ((hasViewedHowSection && howAutoAdvanceEnabled) || howManualPlayNonce > 0)
                  }
                  muted
                  loop={false}
                  playsInline
                  preload="none"
                  aria-hidden="true"
                  tabIndex={-1}
                  disablePictureInPicture
                  disableRemotePlayback
                />
              </div>

              <div className="how-copy-list">
                {howSteps.map((step, index) => (
                  <button
                    key={step.title}
                    type="button"
                    className={`how-copy-item ${activeHowStep === index ? "active" : ""}`}
                    onClick={() => handleHowStepClick(index)}
                  >
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="home-workflow-links" aria-labelledby="home-workflow-links-title">
          <div className="container">
            <div className="home-workflow-links-header">
              <h2 id="home-workflow-links-title">A focused path for every source</h2>
              <p>Choose the workflow that matches your recording, then finish the result in the same editor.</p>
            </div>
            <div className="home-workflow-link-grid">
              <Link href="/audio-to-guitar-tab-converter">
                <strong>Convert an audio file</strong>
                <span>Upload MP3, WAV, or another recording and generate an editable tab draft.</span>
              </Link>
              <Link href="/youtube-to-guitar-tabs">
                <strong>Convert a YouTube clip</strong>
                <span>Paste a public link, choose a riff or solo, and transcribe the focused section.</span>
              </Link>
              <Link href="/ai-guitar-tab-generator">
                <strong>Understand the AI workflow</strong>
                <span>See what affects accuracy and how to turn the first draft into playable tab.</span>
              </Link>
            </div>
          </div>
        </section>

        <section className="editor-showcase" id="editor-showcase">
          <div className="container">
            <div className="editor-showcase-header" data-reveal>
              <span className="editor-showcase-kicker">Editor</span>
              <h2>Create, edit and play your own guitar tabs.</h2>
              <p>
                Note2Tabs guitar-tab editor is a web-based workspace for making guitar tablature.
              </p>
            </div>

            <div className="editor-showcase-sections">
              <article className="editor-showcase-row" data-reveal>
                <div className="editor-showcase-image editor-showcase-image--workspace">
                  <Image
                    src="/images/editor-previews/Editor-main.webp"
                    alt="Guitar tab editor workspace"
                    width="1897"
                    height="949"
                    loading="lazy"
                    sizes="(max-width: 980px) calc(100vw - 36px), 50vw"
                    quality={72}
                    decoding="async"
                  />
                </div>
                <div className="editor-showcase-text">
                  <h3>A complete workspace for guitar tabs</h3>
                  <p>
                    Keep the whole song in one place: unlimited songs, unlimited tracks.
                    The editor has over 30 unique tools helping you create tabs your way.
                    From quick fixes to detailed arrangements, everything you need is built into a single workflow.
                  </p>
                </div>
              </article>

              <article className="editor-showcase-row editor-showcase-row--reverse" data-reveal>
                <div className="editor-showcase-image editor-showcase-image--tools">
                  <Image
                    src="/images/editor-previews/collage.webp"
                    alt="Guitar tab editing tools"
                    width="822"
                    height="604"
                    loading="lazy"
                    sizes="(max-width: 980px) calc(100vw - 36px), 50vw"
                    quality={72}
                    decoding="async"
                  />
                </div>
                <div className="editor-showcase-text">
                  <h3>Tab-making tools tailored to guitarists</h3>
                  <p>
                    What sets us apart from standard guitar-tab editors is our set of specialised tools.
                    Fingering selection and optimizer tools help you find cleaner positions faster instead
                    of manually testing every string and fret combination. Our unique "playing-coordinate" system
                    lets you pick where on the fretboard you'd like to play and "snap to key" lets you quickly type out riffs
                    without thinking about theory.
                  </p>
                </div>
              </article>

              <article className="editor-showcase-row" data-reveal>
                <div className="editor-showcase-image editor-showcase-image--training">
                  <Image
                    src="/images/editor-previews/collage-training.webp"
                    alt="Guitar tab practice and playback tools"
                    width="1242"
                    height="772"
                    loading="lazy"
                    sizes="(max-width: 980px) calc(100vw - 36px), 50vw"
                    quality={72}
                    decoding="async"
                  />
                </div>
                <div className="editor-showcase-text">
                  <h3>Training tools for learning your riffs</h3>
                  <p>
                    Import text-tabs, use your transcribed or own creations and learn the riffs.
                    Playback with different guitar sounds, loop difficult sections and follow along with
                    train mode at increasing speeds.
                  </p>
                </div>
              </article>
            </div>

            <div className="editor-showcase-feature-list" data-reveal>
              <h3>Editor features</h3>
              <ul>
                <li>Keyboard shortcuts for everything</li>
                <li>String and fret optimization</li>
                <li>Snap notes to key</li>
                <li>Automatic fingering selection</li>
                <li>Playback and practice loops</li>
                <li>Section-based song workflow</li>
                <li>Fast cleanup after transcription</li>
                <li>Browser-based tab creation</li>
              </ul>
            </div>
            <div className="editor-showcase-actions" data-reveal>
              <Link href="/editor" className="button-primary">
                Try the guitar tab editor
              </Link>
            </div>
          </div>
        </section>

        <section className="pricing" id="pricing">
          <div className="container">
            <div className="pricing-intro" data-reveal>
              <span className="pill">Plans</span>
              <h2>Start small. Upgrade for full songs.</h2>
              <p>Try out our transcriber and editor, upgrade if you like it.</p>
            </div>
            <div className="pricing-grid">
              <div className="pricing-card pricing-card--free" data-reveal>
                <div className="pricing-header">
                  <span className="pill">Free</span>
                  <div className="pricing-price">
                    <span className="pricing-amount">$0</span>
                    <span className="pricing-interval">/ month</span>
                  </div>
                </div>
                <div className="pricing-plan-copy">
                  <h3>Start transcribing</h3>
                  <p>Best for testing riffs, solos, and short ideas.</p>
                </div>
                <ul className="pricing-list">
                  <li>10 credits per month</li>
                  <li>Upload size: 50 MB</li>
                  <li>Audio clips up to 60 s</li>
                  <li>YouTube clips up to 30 s</li>
                  <li>Standard speed</li>
                  <li>Full access to our guitar-tab editor</li>

                </ul>
              </div>
              <article
                className="pricing-card pricing-card--premium pricing-card--trial"
                data-reveal
              >
                <span className="pricing-trial-ribbon">7-day trial for new subscribers</span>
                <div className="pricing-header">
                  <span className="pill">Premium</span>
                  <div className="pricing-price">
                    <span className="pricing-amount">$5.99</span>
                    <span className="pricing-interval">/ month</span>
                  </div>
                </div>
                <div className="pricing-plan-copy">
                  <h3>For full songs</h3>
                  <p>Built for songs you plan to finish, not just test.</p>
                </div>
                <ul className="pricing-list">
                  <li>50 credits/month, rollover up to 100</li>
                  <li>Upload size: 200 MB</li>
                  <li>Full-length audio-file transcription</li>
                  <li>YouTube clips up to 30 s</li>
                  <li>Extra speed</li>
                </ul>
                <button
                  type="button"
                  className="button-primary pricing-card-cta"
                  onClick={() => void handlePricingClick()}
                  disabled={pricingBusy}
                >
                  {pricingBusy
                    ? "Opening checkout…"
                    : isPremiumUser
                      ? isStaffUser
                        ? "Premium access included"
                        : "Manage current plan"
                      : "Upgrade to Premium"}
                </button>
              </article>
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
                {isSignedIn && (
                  <>
                    <Link href="/tabs" className="button-secondary">
                      Recent transcriptions
                    </Link>
                    <Link href="/gte" className="button-secondary">
                      Continue editing
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
