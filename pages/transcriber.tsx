import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { sendEvent } from "../lib/analytics";
import { copyText } from "../lib/clipboard";
import type { CreditsSummary } from "../lib/credits";
import { gteApi } from "../lib/gteApi";
import { tabSegmentsToStamps } from "../lib/tabTextToStamps";

type TabsResponse = {
  tabs: string[][];
  tokensRemaining?: number;
  credits?: CreditsSummary;
  jobId?: string;
  gteEditorId?: string;
  verificationRequired?: boolean;
};
const isPremiumRole = (role?: string) =>
  role === "PREMIUM" || role === "ADMIN" || role === "MODERATOR" || role === "MOD";

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

let youtubeApiPromise: Promise<void> | null = null;
const loadYouTubeApi = () => {
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    if ((window as any).YT?.Player) {
      resolve();
      return;
    }
    const existing = document.querySelector('script[data-youtube-iframe-api="true"]');
    const previous = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      if (typeof previous === "function") previous();
      resolve();
    };
    if (existing) return;
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.dataset.youtubeIframeApi = "true";
    document.body.appendChild(script);
  });
  return youtubeApiPromise;
};

const pickAudioRecorderMimeType = () => {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm"];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || "";
};

const audioBufferToWav = (buffer: AudioBuffer) => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  const blockAlign = (numChannels * bitDepth) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = buffer.length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channelData = Array.from({ length: numChannels }, (_, idx) => buffer.getChannelData(idx));
  let offset = 44;
  for (let i = 0; i < buffer.length; i += 1) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      let sample = channelData[channel][i];
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return arrayBuffer;
};

const decodeBlobToWav = async (blob: Blob) => {
  const audioContext = new AudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  const decoded = await audioContext.decodeAudioData(arrayBuffer);
  const wavBuffer = audioBufferToWav(decoded);
  await audioContext.close();
  return new Blob([wavBuffer], { type: "audio/wav" });
};

export default function TranscriberPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<"FILE" | "YOUTUBE">("FILE");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [ytStartTime, setYtStartTime] = useState<number | null>(null);
  const [ytDuration, setYtDuration] = useState<number | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [ytPlayerReady, setYtPlayerReady] = useState(false);
  const [ytPlayerError, setYtPlayerError] = useState<string | null>(null);
  const [capturePhase, setCapturePhase] = useState<
    "idle" | "permission" | "recording" | "uploading"
  >("idle");
  const [captureProgress, setCaptureProgress] = useState(0);
  const [captureDuration, setCaptureDuration] = useState(MAX_YT_SNIPPET_SEC);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tabsResult, setTabsResult] = useState<string[][] | null>(null);
  const [credits, setCredits] = useState<CreditsSummary | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
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
  const ytPlayerRef = useRef<any | null>(null);
  const ytPlayerMountRef = useRef<HTMLDivElement | null>(null);
  const captureRafRef = useRef<number | null>(null);
  const isSignedIn = Boolean(session);
  const isEmailVerified = Boolean(session?.user?.isEmailVerified);
  const verifyHref = `/auth/verify-email${
    session?.user?.email ? `?email=${encodeURIComponent(session.user.email)}` : ""
  }`;
  const appendEditorId = useMemo(() => {
    if (!router.isReady) return null;
    const value = router.query.appendEditorId;
    if (Array.isArray(value)) {
      return value[0] ? value[0].trim() : null;
    }
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }, [router.isReady, router.query.appendEditorId]);
  const youtubeId = useMemo(() => parseYouTubeId(youtubeUrl), [youtubeUrl]);
  const resolvedYtDuration = useMemo(() => {
    if (ytDuration === null) return 0;
    return Math.min(MAX_YT_SNIPPET_SEC, Math.max(1, ytDuration));
  }, [ytDuration]);
  const ytWatchUrl = useMemo(() => {
    if (!youtubeId) return "";
    const start = Math.max(0, ytStartTime ?? 0);
    return `https://www.youtube.com/watch?v=${youtubeId}${start ? `&t=${start}s` : ""}`;
  }, [youtubeId, ytStartTime]);
  const captureActive = capturePhase !== "idle";

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
    sendEvent("page_view", { path: "/transcriber" });
  }, []);

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
    if (mode !== "YOUTUBE" || !youtubeId) {
      setYtPlayerReady(false);
      return;
    }
    let cancelled = false;
    setYtPlayerError(null);
    setYtPlayerReady(false);
    void loadYouTubeApi().then(() => {
      if (cancelled) return;
      const YT = (window as any).YT;
      if (!YT?.Player || !ytPlayerMountRef.current) return;
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.loadVideoById(youtubeId);
          setYtPlayerReady(true);
        } catch {
          setYtPlayerError("Could not load this YouTube link.");
        }
        return;
      }
      ytPlayerRef.current = new YT.Player(ytPlayerMountRef.current, {
        videoId: youtubeId,
        playerVars: {
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (!cancelled) setYtPlayerReady(true);
          },
          onError: (event: any) => {
            if (cancelled) return;
            const code = event?.data;
            if (code === 101 || code === 150) {
              setYtPlayerError("Embedding is disabled for this video.");
            } else {
              setYtPlayerError("Could not load this YouTube link.");
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [mode, youtubeId]);

  useEffect(() => {
    if (youtubeId) return;
    if (ytPlayerRef.current?.destroy) {
      ytPlayerRef.current.destroy();
      ytPlayerRef.current = null;
    }
  }, [youtubeId]);

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
        if (appendEditorId && editors.some((editor) => editor.id === appendEditorId)) {
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
    if (mode !== "YOUTUBE") {
      setCapturePhase("idle");
      setCaptureProgress(0);
    }
  }, [mode]);

  const creditsRequested = useMemo(() => {
    const duration = mode === "FILE" ? fileDuration ?? 0 : resolvedYtDuration;
    return Math.max(1, Math.ceil(duration / 30));
  }, [mode, fileDuration, resolvedYtDuration]);

  const youtubeValid = useMemo(() => Boolean(youtubeId), [youtubeId]);

  const canSubmit = useMemo(() => {
    if (isSignedIn && !isEmailVerified) return false;
    if (mode === "FILE") return Boolean(selectedFile) && !loading;
    return (
      youtubeValid &&
      ytStartTime !== null &&
      ytDuration !== null &&
      !loading &&
      !captureActive &&
      (ytPlayerReady || Boolean(ytPlayerError))
    );
  }, [
    mode,
    selectedFile,
    youtubeValid,
    ytStartTime,
    ytDuration,
    ytPlayerReady,
    ytPlayerError,
    loading,
    captureActive,
    isSignedIn,
    isEmailVerified,
  ]);
  const captureTitle =
    capturePhase === "permission"
      ? "Waiting for permission"
      : capturePhase === "recording"
      ? "Recording snippet"
      : capturePhase === "uploading"
      ? "Uploading snippet"
      : "";
  const captureHint =
    capturePhase === "permission"
      ? "Choose the tab with the YouTube player and enable audio."
      : capturePhase === "recording"
      ? "Keep this tab audible while we record."
      : capturePhase === "uploading"
      ? "Sending your snippet to the transcriber."
      : "";
  const captureSeconds = Math.min(captureDuration, Math.round(captureProgress * captureDuration));
  const submitLabel = loading
    ? mode === "YOUTUBE"
      ? "Capturing..."
      : "Generating..."
    : mode === "YOUTUBE"
    ? "Capture & generate tabs"
    : "Generate tabs";

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

  const captureYouTubeSnippet = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("Tab audio capture is not supported in this browser.");
    }

    if (ytStartTime === null || ytDuration === null) {
      throw new Error("Start time and duration are required.");
    }
    const durationSec = Math.min(MAX_YT_SNIPPET_SEC, Math.max(1, ytDuration));
    const startTimeSec = Math.max(0, ytStartTime);
    const manualCapture = !ytPlayerRef.current || !ytPlayerReady || Boolean(ytPlayerError);
    setCaptureDuration(durationSec);
    setCaptureProgress(0);
    setCapturePhase("permission");
    setStatus(
      manualCapture
        ? "Select the YouTube tab and enable audio. We will start recording after a short countdown."
        : "Select the YouTube tab and enable audio to record the snippet."
    );

    let displayStream: MediaStream | null = null;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
      const audioTracks = displayStream.getAudioTracks();
      if (!audioTracks.length) {
        throw new Error("No audio track detected. Share the tab with audio enabled.");
      }

      const audioStream = new MediaStream(audioTracks);
      const mimeType = pickAudioRecorderMimeType();
      const recorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      const stopPromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        };
      });

      const preRollMs = manualCapture ? 3000 : 0;
      if (manualCapture) {
        setStatus("Press play in the YouTube tab. Recording starts in 3 seconds...");
        await new Promise((resolve) => setTimeout(resolve, preRollMs));
      }

      recorder.start();
      setCapturePhase("recording");
      setStatus("Recording YouTube snippet...");
      if (!manualCapture) {
        ytPlayerRef.current.seekTo(startTimeSec, true);
        ytPlayerRef.current.playVideo();
      }

      const startedAt = performance.now();
      const tick = () => {
        const elapsed = (performance.now() - startedAt) / 1000;
        const progress = Math.min(1, elapsed / durationSec);
        setCaptureProgress(progress);
        if (progress < 1) {
          captureRafRef.current = window.requestAnimationFrame(tick);
        }
      };
      captureRafRef.current = window.requestAnimationFrame(tick);

      await new Promise((resolve) => setTimeout(resolve, durationSec * 1000));
      if (!manualCapture) {
        ytPlayerRef.current.pauseVideo();
      }
      recorder.stop();
      displayStream.getTracks().forEach((track) => track.stop());
      if (captureRafRef.current !== null) {
        window.cancelAnimationFrame(captureRafRef.current);
        captureRafRef.current = null;
      }
      setCaptureProgress(1);
      setCapturePhase("uploading");
      setStatus("Preparing snippet...");

      const blob = await stopPromise;
      let finalBlob = blob;
      try {
        finalBlob = await decodeBlobToWav(blob);
      } catch {
        // fallback to original recording
      }
      const file = new File(
        [finalBlob],
        `yt_capture_${youtubeId ?? "snippet"}.wav`,
        { type: finalBlob.type || blob.type || "audio/webm" }
      );
      return { file, durationSec };
    } catch (err) {
      if (displayStream) {
        displayStream.getTracks().forEach((track) => track.stop());
      }
      if (captureRafRef.current !== null) {
        window.cancelAnimationFrame(captureRafRef.current);
        captureRafRef.current = null;
      }
      throw err;
    }
  };

  const handleConvert = async () => {
    if (!session) {
      setError("Sign in to start transcribing.");
      signIn(undefined, { callbackUrl: "/" });
      return;
    }
    if (!isEmailVerified) {
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
    if (mode === "YOUTUBE" && !ytPlayerReady && !ytPlayerError) {
      setError("YouTube player is still loading. Try again in a moment.");
      return;
    }
    if (mode === "YOUTUBE" && (ytStartTime === null || ytDuration === null)) {
      setError("Start time and duration are required for YouTube capture.");
      return;
    }
    if (mode === "YOUTUBE" && ytDuration !== null && ytDuration > MAX_YT_SNIPPET_SEC) {
      setError(`Duration must be ${MAX_YT_SNIPPET_SEC} seconds or less.`);
      return;
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
      if (ytDuration !== null && ytDuration <= 0) {
        setError("Duration must be greater than 0.");
        return;
      }
    }

    setError(null);
    setImportError(null);
    setTabsResult(null);
    setStatus(mode === "FILE" ? "Transcribing audio..." : "Preparing YouTube capture...");
    setLoading(true);
    sendEvent("transcribe_start", { mode, ytUrl: youtubeUrl || undefined });

    try {
      let response: Response;
      if (mode === "FILE" && selectedFile) {
        const fd = new FormData();
        fd.append("mode", "FILE");
        if (fileDuration !== null) {
          fd.append("duration", String(fileDuration));
        }
        fd.append("file", selectedFile);
        response = await fetch("/api/transcribe", { method: "POST", body: fd });
      } else {
        const capture = await captureYouTubeSnippet();
        setStatus("Uploading snippet...");
        const fd = new FormData();
        fd.append("mode", "FILE");
        fd.append("duration", String(capture.durationSec));
        fd.append("file", capture.file);
        response = await fetch("/api/transcribe", { method: "POST", body: fd });
      }

      const data = (await response.json().catch(() => ({}))) as { error?: string } & TabsResponse;
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
      setTabsResult(data.tabs);
      setSelectedSegments(new Set());
      if (data.credits) {
        setCredits(data.credits);
      }
      setStatus(null);
      sendEvent("transcribe_success", { mode, jobId: data.jobId });
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
      sendEvent("transcribe_error", { mode, error: err?.message || "unknown" });
    } finally {
      setLoading(false);
      setCapturePhase("idle");
    }
  };

  const handleImportToEditor = async () => {
    if (!tabsResult || importBusy) return;
    setImportBusy(true);
    setImportError(null);
    try {
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

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void handleConvert();
  };
  const creditsUsageLabel = credits
    ? `${credits.used}/${credits.limit}`
    : session
    ? "-"
    : "10";
  const creditsResetLabel = credits ? new Date(credits.resetAt).toLocaleDateString() : "";
  const showCreditsEmpty = credits && credits.remaining === 0;
  const resetLabelText = isPremiumRole(session?.user?.role) ? "Next credits" : "Resets";

  return (
    <>
      <Head>
        <title>Note2Tabs - Transcriber</title>
        <meta
          name="description"
          content="Capture a short audio snippet and generate a draft guitar tab you can refine."
        />
      </Head>

      <main className="page page-home">
        <section className="hero" id="hero">
          <div className="hero-glow hero-glow--one" aria-hidden="true" />
          <div className="hero-glow hero-glow--two" aria-hidden="true" />
          <div className="container hero-stack hero-stack--centered">
            <div className="hero-heading" data-reveal>
              <h1 className="hero-title">Transcriber</h1>
              <p className="hero-subtitle">
                Capture a short snippet and get a draft tab you can refine in the editor.
              </p>
              <div className="button-row hero-cta-row">
                <Link href="/gte" className="button-primary">
                  Open Guitar Tab Editor
                </Link>
                <Link href="/" className="button-secondary">
                  Back to home
                </Link>
              </div>
              <p className="muted text-small">
                Max {MAX_YT_SNIPPET_SEC} seconds per capture. Choose a start time and duration.
              </p>
            </div>
            <form className="prompt-shell" data-reveal onSubmit={handleSubmit}>
              {isSignedIn && credits && (
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
                      placeholder="https://youtube.com/..."
                    />
                  </label>
                )}

                {mode === "YOUTUBE" && (
                  <div className="yt-preview">
                    <div className="yt-frame">
                      {youtubeId ? (
                        <div ref={ytPlayerMountRef} className="yt-player" />
                      ) : (
                        <div className="yt-placeholder">Paste a YouTube link to load a preview.</div>
                      )}
                    </div>
                    <div className="yt-guide">
                      <strong>Consent capture</strong>
                      <p>
                        We play the snippet here and record tab audio after you grant permission. Max{" "}
                        {MAX_YT_SNIPPET_SEC} seconds.
                      </p>
                      {ytPlayerError && <span className="yt-error">{ytPlayerError}</span>}
                      {ytPlayerError && ytWatchUrl && (
                        <button
                          type="button"
                          className="button-secondary button-small"
                          onClick={() => window.open(ytWatchUrl, "_blank", "noopener")}
                        >
                          Open in YouTube tab
                        </button>
                      )}
                      {youtubeId && !ytPlayerReady && !ytPlayerError && (
                        <span className="yt-loading">Loading the player...</span>
                      )}
                      <span className="yt-note">
                        When you click Generate tabs, choose this tab and enable Audio in the share dialog.
                      </span>
                    </div>
                  </div>
                )}

                {mode === "YOUTUBE" && capturePhase !== "idle" && (
                  <div className="capture-card">
                    <div className="capture-head">
                      <div>
                        <strong>{captureTitle}</strong>
                        <span className="capture-sub">{captureHint}</span>
                      </div>
                      <span className="capture-time">
                        {captureSeconds}s / {captureDuration}s
                      </span>
                    </div>
                    <div className="capture-bar">
                      <span style={{ width: `${Math.round(captureProgress * 100)}%` }} />
                    </div>
                  </div>
                )}

                {isSignedIn && mode === "FILE" && (
                  <div className="prompt-footer">
                    <button
                      type="button"
                      className="advanced-toggle"
                      onClick={() => setShowAdvanced((prev) => !prev)}
                    >
                      {showAdvanced ? "Hide advanced" : "Advanced options"}
                    </button>
                  </div>
                )}
              </div>

              {mode === "YOUTUBE" && (
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
                    Duration (sec, max 30)
                    <input
                      type="number"
                      min={1}
                      max={MAX_YT_SNIPPET_SEC}
                      value={ytDuration ?? ""}
                      onChange={(event) => {
                        const next = parseOptionalNumber(event.target.value);
                        if (next === null) {
                          setYtDuration(null);
                          return;
                        }
                        setYtDuration(Math.min(MAX_YT_SNIPPET_SEC, Math.max(1, next)));
                      }}
                      required
                    />
                  </label>
                  <div className="advanced-note">
                    We record the snippet in real time after you grant tab audio capture.
                  </div>
                </div>
              )}

              {isSignedIn && showAdvanced && mode === "FILE" && (
                <div className="advanced-grid">
                  <label>
                    Approx length (sec)
                    <input
                      type="number"
                      value={fileDuration ?? ""}
                      onChange={(event) => setFileDuration(parseOptionalNumber(event.target.value))}
                    />
                  </label>
                </div>
              )}

              <div className="prompt-actions">
                <button type="submit" className="button-primary" disabled={!canSubmit}>
                  {submitLabel}
                </button>
              </div>

              <div className="disclaimer">
                The transcriber is still a work in progress. Expect occasional errors while we improve it.
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
                  {isPremiumRole(session?.user?.role)
                    ? `Credits used. Next credits arrive on ${creditsResetLabel}.`
                    : `Monthly credits used. Upgrade to Premium or wait until ${creditsResetLabel}.`}
                </div>
              )}
              {isSignedIn && (
                <p className="footnote">
                  {isPremiumRole(session?.user?.role)
                    ? "Premium credits roll over. 50 credits added monthly."
                    : `This job uses about ${creditsRequested} credit${
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
                  <p>Pick the tab blocks you want to import or copy.</p>
                </div>
                <div className="results-actions">
                  {isSignedIn && (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="rounded-md border border-slate-200 bg-white px-2 py-2 text-sm"
                        value={editorChoice}
                        onChange={(event) => setEditorChoice(event.target.value)}
                        disabled={editorLoading}
                      >
                        <option value="new">New editor</option>
                        {editorChoices.map((editor) => (
                          <option key={editor.id} value={editor.id}>
                            {editor.name ? editor.name : `${editor.id.slice(0, 8)}...`}
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
                  <Link href="/account" className="button-secondary">
                    Open account
                  </Link>
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
                      <pre className="whitespace-pre-wrap">{segment.join("\n")}</pre>
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
