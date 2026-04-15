import Head from "next/head";
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
};
const isPremiumRole = (role?: string) =>
  role === "PREMIUM" || role === "ADMIN" || role === "MODERATOR" || role === "MOD";
const MAX_FREE_BYTES = 50 * 1024 * 1024;
const MAX_PREMIUM_BYTES = 200 * 1024 * 1024;

const formatMb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

const parseOptionalNumber = (value: string): number | null => {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const MAX_YT_SNIPPET_SEC = 30;

const isYouTubeId = (value: string) => /^[a-zA-Z0-9_-]{11}$/.test(value);

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
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [separateGuitar, setSeparateGuitar] = useState(true);
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounter = useRef(0);
  const convertInFlightRef = useRef(false);
  const disableDbInDev = isLocalNoDbClientMode;
  const transcriberSession = session ?? null;
  const isSignedIn = Boolean(transcriberSession);
  const requireVerifiedEmail = process.env.NODE_ENV === "production";
  const isEmailVerified = !requireVerifiedEmail || Boolean(transcriberSession?.user?.isEmailVerified);
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
  const shouldDeferEditorSync = Boolean(appendEditorId);

  useEffect(() => {
    if (session?.user?.monthlyCreditsUsed !== undefined) {
      setCredits({
        used: session.user.monthlyCreditsUsed ?? 0,
        limit: session.user.monthlyCreditsLimit ?? 0,
        remaining: session.user.monthlyCreditsRemaining ?? 0,
        resetAt: session.user.monthlyCreditsResetAt || new Date().toISOString(),
        unlimited: Boolean(session.user.monthlyCreditsUnlimited),
      });
    }
  }, [session]);

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
    setYtStartTime((prev) => (prev === null ? 0 : prev));
    setYtEndTime((prev) => (prev === null ? MAX_YT_SNIPPET_SEC : prev));
  }, [mode]);

  const creditsRequested = useMemo(() => {
    const duration = mode === "FILE" ? fileDuration ?? 0 : resolvedYtDuration;
    return Math.max(1, Math.ceil(duration / 30));
  }, [mode, fileDuration, resolvedYtDuration]);

  const youtubeValid = useMemo(() => Boolean(youtubeId), [youtubeId]);

  const canSubmit = useMemo(() => {
    if (isSignedIn && !isEmailVerified) return false;
    if (mode === "FILE") return Boolean(selectedFile) && !loading;
    return youtubeValid && ytStartTime !== null && ytEndTime !== null && !loading;
  }, [
    mode,
    selectedFile,
    youtubeValid,
    ytStartTime,
    ytEndTime,
    loading,
    isSignedIn,
    isEmailVerified,
  ]);
  const submitLabel = loading
    ? mode === "YOUTUBE"
      ? "Downloading..."
      : "Generating..."
    : mode === "YOUTUBE"
    ? "Download & generate tabs"
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

  const handleConvert = async () => {
    if (convertInFlightRef.current || loading) return;

    if (!transcriberSession && !disableDbInDev) {
      setError("Sign in to start transcribing.");
      signIn(undefined, { callbackUrl: "/" });
      return;
    }
    if (transcriberSession && !isEmailVerified) {
      setError("Please verify your email before using the transcriber.");
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
    if (mode === "YOUTUBE" && (ytStartTime === null || ytEndTime === null)) {
      setError("Start time and end time are required for YouTube download.");
      return;
    }
    if (mode === "YOUTUBE" && ytStartTime !== null && ytEndTime !== null && ytEndTime <= ytStartTime) {
      setError("End time must be greater than start time.");
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
      if (ytEndTime !== null && ytEndTime <= 0) {
        setError("End time must be greater than 0.");
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

      const data = (await response.json().catch(() => ({}))) as { error?: string } & TabsResponse;
      if (response.status === 202 && data.jobId) {
        if (data.credits) {
          setCredits(data.credits);
        }
        setStatus("Opening progress screen...");
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
          setError("Please verify your email before using the transcriber.");
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
      sendEvent("transcribe_success", { mode, jobId: data.jobId });
      if (transcriberSession && data.tabJobId) {
        setStatus("Tabs ready. Opening import...");
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

  return (
    <>
      <Head>
        <title>Note2Tabs - Transcriber</title>
        <meta
          name="description"
          content="Upload audio or enter a YouTube segment to generate a draft guitar tab you can refine."
        />
      </Head>

      <main className="page page-home">
        <section className="hero" id="hero">
          <div className="hero-glow hero-glow--one" aria-hidden="true" />
          <div className="hero-glow hero-glow--two" aria-hidden="true" />
          <div className="container hero-stack hero-stack--centered">
            <div className="hero-heading" data-reveal>
              <div className="hero-title-row">
                <h1 className="hero-title">Transcriber</h1>
                <span className="badge transcriber-version">v0.1.3</span>
              </div>
              <p className="hero-subtitle">
                Upload audio or enter a YouTube segment and get a draft tab you can refine in the editor.
              </p>
              <div className="button-row hero-cta-row">
                <Link href="/editor" className="button-primary">
                  Open Guitar Tab Editor
                </Link>
                <Link href="/" className="button-secondary">
                  Back to home
                </Link>
              </div>
              <p className="muted text-small">
                Up to {MAX_YT_SNIPPET_SEC} seconds per YouTube clip.
              </p>
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
                    onClick={() => fileInputRef.current?.click()}
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
                      accept="audio/*"
                      hidden
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
              </div>

              {mode === "YOUTUBE" && (
                <div className="prompt-footer">
                  <button
                    type="button"
                    className="advanced-toggle"
                    aria-expanded={showAdvancedOptions}
                    onClick={() => setShowAdvancedOptions((prev) => !prev)}
                  >
                    Advanced Options
                  </button>
                </div>
              )}

              {mode === "YOUTUBE" && showAdvancedOptions && (
                <div className="advanced-grid">
                  <label>
                    Start time (sec)
                    <input
                      type="number"
                      min={0}
                      value={ytStartTime ?? ""}
                      onChange={(event) => setYtStartTime(parseOptionalNumber(event.target.value))}
                      required
                    />
                  </label>
                  <label>
                    End time (sec)
                    <input
                      type="number"
                      min={ytStartTime !== null ? ytStartTime + 1 : 1}
                      value={ytEndTime ?? ""}
                      onChange={(event) => {
                        setYtEndTime(parseOptionalNumber(event.target.value));
                      }}
                      required
                    />
                  </label>
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
              {isSignedIn && !isEmailVerified && (
                <div className="notice">
                  Verify your email to use the transcriber.{" "}
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
              {isSignedIn && (
                <p className="footnote">
                  {isPremiumRole(transcriberSession?.user?.role)
                    ? "Premium: 50 credits monthly, with rollover."
                    : `Uses about ${creditsRequested} credit${
                        creditsRequested > 1 ? "s" : ""
                      } from your 10 monthly credits.`}
                </p>
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
                  <p>Pick blocks to import or copy.</p>
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
                    <Link href="/account" className="button-secondary">
                      Open account
                    </Link>
                  ) : disableDbInDev ? (
                    <Link href={`/gte/${GTE_GUEST_EDITOR_ID}`} className="button-secondary">
                      Open guest editor
                    </Link>
                  ) : (
                    <Link href="/account" className="button-secondary">
                      Open account
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
      </main>
    </>
  );
}
