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
const MAX_FREE_BYTES = 50 * 1024 * 1024;
const MAX_PREMIUM_BYTES = 500 * 1024 * 1024;

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

export default function HomePage() {
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
  const [pricingBusy, setPricingBusy] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
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
    sendEvent("page_view", { path: "/" });
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

  useEffect(() => {
    if (mode !== "YOUTUBE") return;
    setYtStartTime((prev) => (prev === null ? 0 : prev));
    setYtDuration((prev) => (prev === null ? MAX_YT_SNIPPET_SEC : prev));
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

  const openTabsInEditor = async (segments: string[][], gteEditorId?: string | null) => {
    if (gteEditorId) {
      await router.push(`/gte/${gteEditorId}?source=transcriber`);
      return;
    }
    const { stamps, totalFrames } = tabSegmentsToStamps(segments);
    if (stamps.length === 0) {
      throw new Error("No tabs available to import into the editor.");
    }
    const created = await gteApi.createEditor();
    await gteApi.appendImportTab(created.editorId, { stamps, totalFrames });
    await router.push(`/gte/${created.editorId}?source=transcriber`);
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

    if (mode === "FILE" && selectedFile) {
      const maxBytes = isPremiumRole(session?.user?.role) ? MAX_PREMIUM_BYTES : MAX_FREE_BYTES;
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
      if (ytDuration !== null && ytDuration <= 0) {
        setError("Duration must be greater than 0.");
        return;
      }
    }

    setError(null);
    setImportError(null);
    setTabsResult(null);
    setStatus(mode === "FILE" ? "Uploading audio..." : "Preparing YouTube capture...");
    setLoading(true);
    sendEvent("transcribe_start", { mode, ytUrl: youtubeUrl || undefined });

    try {
      let response: Response;
      if (mode === "FILE" && selectedFile) {
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
          throw new Error(presignData?.error || "Could not prepare upload.");
        }

        const uploadRes = await fetch(presignData.url, {
          method: "PUT",
          headers: { "Content-Type": selectedFile.type || "application/octet-stream" },
          body: selectedFile,
        });
        if (!uploadRes.ok) {
          throw new Error("Upload failed. Please try again.");
        }

        setStatus("Transcribing audio...");
        const payload: Record<string, unknown> = {
          mode: "FILE",
          s3Key: presignData.key,
          fileName: selectedFile.name,
        };
        if (fileDuration !== null) payload.duration = fileDuration;
        response = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
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
      const nextTabs = data.tabs;
      setSelectedSegments(new Set());
      if (data.credits) {
        setCredits(data.credits);
      }
      sendEvent("transcribe_success", { mode, jobId: data.jobId });
      setStatus("Tabs ready. Opening Guitar Tab Editor...");
      try {
        await openTabsInEditor(nextTabs, data.gteEditorId);
        return;
      } catch (openErr: any) {
        setTabsResult(nextTabs);
        setImportError(
          openErr?.message ||
            "Transcription succeeded, but we could not open the editor automatically. Import manually below."
        );
        setStatus(null);
      }
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
      <main className="page page-home">
        <section className="hero hero--landing-funnel" id="hero">
          <div className="hero-glow hero-glow--one" aria-hidden="true" />
          <div className="hero-glow hero-glow--two" aria-hidden="true" />
          <div className="container hero-stack hero-stack--centered">
            <section className="seo-intro seo-crawler-only" aria-label="Note2Tabs overview" data-reveal>
              <h1 className="seo-title">Note2Tabs – Guitar tab generator and editor</h1>
              <p className="seo-copy">
                Note2Tabs turns audio into guitar tabs so you can learn songs faster and with less trial and error.
                Upload a track or paste a YouTube link to generate playable tablature in seconds.
              </p>
              <p className="seo-copy">
                Edit fingerings, simplify tricky passages, and practice with clean, readable layouts right in the
                browser.
              </p>
            </section>
            <div className="hero-heading" data-reveal>
              <h2 className="hero-title">Convert Any Song Into Playable Guitar Tabs</h2>
              <p className="hero-subtitle">
                Upload an audio file or paste a YouTube link. Edit instantly in our smart tab editor.
              </p>
            </div>
            <form className="prompt-shell prompt-shell--funnel" data-reveal onSubmit={handleSubmit}>
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

              <div className="mode-switch mode-switch--hero" role="tablist" aria-label="Input mode">
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

              <div className="funnel-row">
                <div
                  className={`funnel-input ${mode === "FILE" ? "is-file" : "is-url"} ${
                    dragActive ? "active" : ""
                  }`}
                  onClick={mode === "FILE" ? () => fileInputRef.current?.click() : undefined}
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
                      {selectedFile ? selectedFile.name : "Paste YouTube link or upload file"}
                    </span>
                  ) : (
                    <input
                      type="url"
                      value={youtubeUrl}
                      onChange={(event) => setYoutubeUrl(event.target.value)}
                      placeholder="Paste YouTube link or upload file"
                    />
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    hidden
                    onChange={onFileChange}
                  />
                </div>
                <button type="submit" className="button-primary funnel-submit" disabled={!canSubmit}>
                  {loading ? submitLabel : "Convert to Tabs - Free"}
                </button>
              </div>

              {(mode === "YOUTUBE" || (isSignedIn && mode === "FILE")) && (
                <div className="prompt-field prompt-field--compact">
                  {mode === "YOUTUBE" && (
                    <>
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
                            When you click Convert, choose this tab and enable Audio in the share dialog.
                          </span>
                        </div>
                      </div>

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
                    </>
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
                    : `This job uses about ${creditsRequested} credit${creditsRequested > 1 ? "s" : ""} from your 10 monthly credits.`}
                </p>
              )}
            </form>
            <div className="hero-trust" data-reveal>
              <span className="hero-trust-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
                </svg>
              </span>
              <strong>Trusted by guitarists worldwide</strong>
            </div>

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
                  <li>Standard speed</li>
                  <li>Basic export</li>
                </ul>
              </div>
              <button
                type="button"
                className="pricing-card"
                data-reveal
                onClick={handlePricingClick}
                disabled={pricingBusy}
              >
                <div className="pricing-header">
                  <span className="pill">Premium</span>
                  <div className="pricing-price">
                    <span className="pricing-amount">$5.99</span>
                    <span className="pricing-interval">/ month</span>
                  </div>
                </div>
                <ul className="pricing-list">
                  <li>50 credits per month (roll over)</li>
                  <li>No ads</li>
                  <li>More features coming soon</li>
                </ul>
              </button>
            </div>
            {pricingError && <div className="error">{pricingError}</div>}
          </div>
        </section>

        <section className="benefits" id="features">
          <div className="container">
            <h2 className="section-title" data-reveal>
              Practice-friendly by default
            </h2>
            <p className="section-subtitle" data-reveal>
              Clean output and a focused editor, ready when you scroll.
            </p>
            <div className="benefits-grid">
              <div className="benefit-card" data-reveal>
                <div className="icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 8v8m-4-4h8"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </div>
                <h4>Playable previews</h4>
                <p>Hear your tabs and catch timing issues before you export.</p>
              </div>
              <div className="benefit-card" data-reveal>
                <div className="icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 12h14"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M9 8h6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M9 16h6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <h4>Fingerings & optimals</h4>
                <p>Switch fingerings and run optimals to clean up tricky passages.</p>
              </div>
              <div className="benefit-card" data-reveal>
                <div className="icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M4 12a8 8 0 0116 0v5H4v-5z"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <path
                      d="M8 17v2h8v-2"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <h4>Drafts when you need them</h4>
                <p>Use the transcriber for quick starts, then refine in the editor.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="steps" id="how">
          <div className="container">
            <h2 className="section-title" data-reveal>
              How it works
            </h2>
            <div className="steps-grid">
              <div className="step-card" data-reveal>
                <div className="icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 16V4m0 0l-4 4m4-4l4 4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <h3>1. Open the editor</h3>
                <p>Start a new Guitar Tab Editor session from your library.</p>
              </div>
              <div className="step-card" data-reveal>
                <div className="icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M9 18V6l12-2v12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2" />
                    <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </div>
                <h3>2. Make it playable</h3>
                <p>Play back, switch fingerings, and optimize for clean output.</p>
              </div>
              <div className="step-card" data-reveal>
                <div className="icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M6 3l12 6-12 6v6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h3>3. Optional transcriber</h3>
                <p>Use the transcriber for drafts, then polish in the editor.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
