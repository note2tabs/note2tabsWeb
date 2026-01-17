import type React from "react";
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState, useRef } from "react";
import { signIn, useSession } from "next-auth/react";
import logo from "../image1.png";
import { sendEvent } from "../lib/analytics";
import Header from "../components/Header";

type TranscribeResponse = { jobId?: string; tokensRemaining?: number; error?: string };
const isPremiumRole = (role?: string) =>
  role === "PREMIUM" || role === "ADMIN" || role === "MODERATOR" || role === "MOD";

export default function HomePage() {
  const { data: session } = useSession();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"FILE" | "YOUTUBE" | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [ytStartTime, setYtStartTime] = useState(0);
  const [ytDuration, setYtDuration] = useState(30);
  const [fileDuration, setFileDuration] = useState(60);
  const [ytSeparateGuitar, setYtSeparateGuitar] = useState(false);
  const [tokensRemaining, setTokensRemaining] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stripeReady = Boolean(process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_MONTHLY);

  useEffect(() => {
    if (session?.user?.tokensRemaining !== undefined) {
      setTokensRemaining(session.user.tokensRemaining ?? null);
    }
  }, [session]);

  useEffect(() => {
    sendEvent("page_view", { path: "/" });
  }, []);

  const minutesRequested = useMemo(() => {
    if (mode === "FILE") return Math.max(1, Math.ceil(fileDuration / 60));
    return Math.max(1, Math.ceil(ytDuration / 60));
  }, [mode, fileDuration, ytDuration]);

  const youtubeValid = useMemo(() => {
    if (!youtubeUrl.trim()) return false;
    return youtubeUrl.trim().startsWith("http");
  }, [youtubeUrl]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setError(null);
  };

  const handleConvert = async () => {
    if (!session) {
      setError("Sign in to start transcribing.");
      signIn(undefined, { callbackUrl: "/" });
      return;
    }
    if (!mode) {
      setError("Choose File or YouTube to continue.");
      return;
    }
    if (mode === "FILE" && !selectedFile) {
      setError("Please select an audio file to transcribe.");
      return;
    }
    if (mode === "YOUTUBE" && !youtubeValid) {
      setError("Please paste a valid YouTube link (starting with http).");
      return;
    }

    setError(null);
    setStatus(mode === "FILE" ? "Transcribing audio…" : "Downloading from YouTube…");
    setLoading(true);
    sendEvent("transcribe_start", { mode, ytUrl: youtubeUrl || undefined });

    try {
      let response: Response;
      if (mode === "FILE" && selectedFile) {
        const fd = new FormData();
        fd.append("mode", "FILE");
        fd.append("duration", String(fileDuration || 60));
        fd.append("file", selectedFile);
        response = await fetch("/api/transcribe", { method: "POST", body: fd });
      } else {
        response = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "YOUTUBE",
            youtubeUrl: youtubeUrl.trim(),
            startTime: ytStartTime,
            duration: ytDuration,
            separateGuitar: ytSeparateGuitar,
          }),
        });
      }

      const data = (await response.json().catch(() => ({}))) as { error?: string } & TranscribeResponse;
      if (!response.ok) {
        setError(data?.error || "Transcription failed. Please try again.");
        setStatus(null);
        sendEvent("transcribe_error", { mode, error: data?.error || "unknown" });
        return;
      }
      if (data.jobId) {
        window.location.href = `/job/${data.jobId}`;
        return;
      }
      setError("No job id returned from server.");
      setStatus(null);
      if (typeof data.tokensRemaining === "number") {
        setTokensRemaining(data.tokensRemaining);
      }
      setStatus(null);
      sendEvent("transcribe_success", { mode, jobId: data.jobId });
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Something went wrong. Please try again.");
      setStatus(null);
      sendEvent("transcribe_error", { mode, error: err?.message || "unknown" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Note2Tabs – Turn any song into clean guitar tabs</title>
        <meta
          name="description"
          content="Upload audio or paste a YouTube link and get AI-generated guitar tabs directly in your browser."
        />
      </Head>
      <Header />
      <main className="bg-slate-950 text-slate-100 px-4 py-10">
        <div className="mx-auto w-full max-w-5xl space-y-12">
          <header className="space-y-4 text-center">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Turn any song into clean guitar tabs.
            </h1>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Upload audio or paste a YouTube link. Powered by your local FastAPI engine. Tabs are saved to
              your account for easy access.
            </p>
            <ul className="flex justify-center gap-3 text-xs text-slate-400 flex-wrap">
              <li className="px-3 py-1 rounded-full border border-slate-800 bg-slate-900/60">
                Fast, local processing
              </li>
              <li className="px-3 py-1 rounded-full border border-slate-800 bg-slate-900/60">
                Works with files or YouTube
              </li>
              <li className="px-3 py-1 rounded-full border border-slate-800 bg-slate-900/60">
                Tabs saved to your history
              </li>
            </ul>
            <div className="flex justify-center gap-3">
              <a
                href="#transcribe"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Start transcribing
              </a>
              {!session && (
                <button
                  type="button"
                  onClick={() => signIn(undefined, { callbackUrl: "/" })}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800"
                >
                  Sign in to get 120 free minutes
                </button>
              )}
            </div>
          </header>

          <div className="grid gap-8 lg:grid-cols-[2fr,1fr] items-start" id="transcribe">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 md:p-8 shadow-xl shadow-black/30 space-y-5">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-xl font-semibold">Transcribe</h2>
                  <p className="text-sm text-slate-400">Pick your source, then transcribe.</p>
                </div>
              <div className="text-xs text-slate-400">
                  {session?.user?.role
                    ? isPremiumRole(session.user.role)
                      ? `Plan: ${session.user.role} – unlimited minutes.`
                      : `Free minutes remaining: ${tokensRemaining ?? session?.user?.tokensRemaining ?? 0}`
                    : "Sign up to get 120 free minutes of transcription."}
                </div>
              </div>

              <div className="inline-flex rounded-xl border border-slate-700 bg-slate-900/60 p-1 text-sm font-semibold text-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setMode("FILE");
                    setYoutubeUrl("");
                    setError(null);
                  }}
                  className={`px-4 py-2 rounded-lg transition ${
                    mode === "FILE" ? "bg-blue-500 text-white" : "text-slate-300"
                  }`}
                >
                  File upload
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("YOUTUBE");
                    setSelectedFile(null);
                    setError(null);
                  }}
                  className={`px-4 py-2 rounded-lg transition ${
                    mode === "YOUTUBE" ? "bg-blue-500 text-white" : "text-slate-300"
                  }`}
                >
                  YouTube link
                </button>
              </div>

              {mode === "FILE" && (
                <div className="space-y-3">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file) {
                        setSelectedFile(file);
                        setError(null);
                      }
                    }}
                    className="block rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-4 py-6 text-center hover:border-blue-500 transition cursor-pointer"
                  >
                    <p className="text-sm font-semibold text-slate-100">
                      Drop an audio file here or click to browse
                    </p>
                    <p className="text-xs text-slate-400">MP3/WAV · max 100 MB</p>
                  </div>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={onFileChange}
                    ref={fileInputRef}
                    className="hidden"
                  />
                  {selectedFile && (
                    <div className="text-xs text-slate-400">
                      Selected: {selectedFile.name}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400">Estimated duration (sec)</label>
                      <input
                        type="number"
                        min="10"
                        value={fileDuration}
                        onChange={(e) => setFileDuration(Number(e.target.value) || 60)}
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="text-xs text-slate-500 flex items-end">
                      Used to estimate token consumption for free accounts.
                    </div>
                  </div>
                </div>
              )}

              {mode === "YOUTUBE" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-200">YouTube link</p>
                      <p className="text-xs text-slate-400">Paste a URL instead of uploading a file.</p>
                    </div>
                  </div>
                  <input
                    type="text"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-slate-400">Start time (seconds)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={ytStartTime}
                        onChange={(e) => setYtStartTime(Number(e.target.value) || 0)}
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">Duration (seconds)</label>
                      <input
                        type="number"
                        min="1"
                        step="0.1"
                        value={ytDuration}
                        onChange={(e) => setYtDuration(Number(e.target.value) || 1)}
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-sm text-slate-200">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500"
                          checked={ytSeparateGuitar}
                          onChange={(e) => setYtSeparateGuitar(e.target.checked)}
                        />
                        Separate guitar
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {error}
                </div>
              )}
              {!session && (
                <p className="text-xs text-amber-200">
                  You’ll be asked to sign in or create a free account before transcribing.
                </p>
              )}
              {mode === "YOUTUBE" && youtubeUrl && !youtubeValid && (
                <p className="text-xs text-amber-300">Please enter a valid YouTube URL starting with http.</p>
              )}
              {status && (
                <div className="text-sm text-blue-200">{status}</div>
              )}

              <button
                type="button"
                onClick={handleConvert}
                disabled={
                  loading ||
                  !mode ||
                  (mode === "FILE" && !selectedFile) ||
                  (mode === "YOUTUBE" && !youtubeValid)
                }
                aria-disabled={
                  loading ||
                  !mode ||
                  (mode === "FILE" && !selectedFile) ||
                  (mode === "YOUTUBE" && !youtubeValid)
                }
                className="w-full rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-blue-500/30 transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Converting…" : "Convert to Tabs"}
              </button>
              <p className="text-xs text-slate-500">
                {isPremiumRole(session?.user?.role)
                  ? "Premium/Admin – unlimited minutes per job."
                  : `This will consume approximately ${minutesRequested} minute${minutesRequested > 1 ? "s" : ""} of your free balance.`}
              </p>

              {loading && (
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-sm text-blue-200">
                  {mode === "YOUTUBE" ? "Downloading from YouTube…" : "Transcribing audio…"}
                </div>
              )}

            </section>

            <aside className="space-y-5">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
                <h3 className="text-lg font-semibold">How it works</h3>
                <ol className="space-y-2 text-sm text-slate-300 list-decimal list-inside">
                  <li>Upload audio or paste a YouTube link.</li>
                  <li>We proxy to your local FastAPI engine for separation + transcription.</li>
                  <li>Tabs stream back and save to your account history.</li>
                </ol>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
                <h3 className="text-lg font-semibold">Pricing</h3>
                <div className="grid gap-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-white">Free</p>
                      <p className="text-sm text-slate-300">€0 / month</p>
                    </div>
                    <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                      <li>120 free minutes of AI transcription</li>
                      <li>Basic support</li>
                    </ul>
                    <button
                      type="button"
                      onClick={() => (session ? document.getElementById("transcribe")?.scrollIntoView({ behavior: "smooth" }) : signIn(undefined, { callbackUrl: "/" }))}
                      className="mt-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                    >
                      {session ? "Start for free" : "Sign up to start"}
                    </button>
                  </div>
                  <div className="rounded-lg border border-blue-600/40 bg-blue-600/10 p-4 space-y-2 shadow-inner">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-white">Premium</p>
                      <p className="text-sm text-slate-100">Coming soon</p>
                    </div>
                    <ul className="text-sm text-slate-200 space-y-1 list-disc list-inside">
                      <li>Unlimited minutes</li>
                      <li>Priority jobs</li>
                    </ul>
                    <button
                      type="button"
                      disabled={!stripeReady}
                      onClick={async () => {
                        if (!stripeReady) {
                          setError("Stripe not configured yet.");
                          return;
                        }
                        try {
                          const res = await fetch("/api/stripe/create-checkout-session", { method: "POST" });
                          const data = await res.json();
                          if (res.ok && data?.url) {
                            window.location.href = data.url;
                          } else {
                            setError(data?.error || "Stripe not configured yet.");
                          }
                        } catch (err: any) {
                          setError(err?.message || "Stripe not configured yet.");
                        }
                      }}
                      className="mt-2 rounded-lg border border-blue-400 px-3 py-2 text-xs font-semibold text-blue-100 hover:bg-blue-500/10 disabled:opacity-60"
                    >
                      Upgrade (coming soon)
                    </button>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
                <h3 className="text-lg font-semibold">Stay legal</h3>
                <p className="text-sm text-slate-300">
                  Only upload content you have rights to. Audio is processed locally via your FastAPI server.
                </p>
                <div className="flex gap-3 text-xs text-blue-400">
                  <Link href="/terms" className="hover:text-blue-300">
                    Terms
                  </Link>
                  <Link href="/privacy" className="hover:text-blue-300">
                    Privacy
                  </Link>
                </div>
              </div>
            </aside>
          </div>

          <footer className="border-t border-slate-800 pt-6 text-xs text-slate-500 flex items-center justify-between flex-wrap gap-3">
            <span>© {new Date().getFullYear()} Note2Tabs</span>
            <div className="flex items-center gap-3">
              <Link href="/terms" className="hover:text-slate-200">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-slate-200">
                Privacy
              </Link>
              <Link href="/contact" className="hover:text-slate-200">
                Contact
              </Link>
            </div>
          </footer>
        </div>
      </main>
    </>
  );
}
