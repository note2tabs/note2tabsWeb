import Head from "next/head";
import Link from "next/link";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { sendEvent } from "../lib/analytics";
import { copyText } from "../lib/clipboard";
import type { CreditsSummary } from "../lib/credits";

type TabsResponse = {
  tabs: string[][];
  tokensRemaining?: number;
  credits?: CreditsSummary;
  jobId?: string;
  gteEditorId?: string;
};
const isPremiumRole = (role?: string) =>
  role === "PREMIUM" || role === "ADMIN" || role === "MODERATOR" || role === "MOD";

const parseOptionalNumber = (value: string): number | null => {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export default function HomePage() {
  const { data: session } = useSession();
  const [mode, setMode] = useState<"FILE" | "YOUTUBE">("FILE");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [ytStartTime, setYtStartTime] = useState<number | null>(null);
  const [ytDuration, setYtDuration] = useState<number | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [ytSeparateGuitar, setYtSeparateGuitar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tabsResult, setTabsResult] = useState<string[][] | null>(null);
  const [credits, setCredits] = useState<CreditsSummary | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [pricingBusy, setPricingBusy] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounter = useRef(0);
  const isSignedIn = Boolean(session);

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

  const creditsRequested = useMemo(() => {
    const duration = mode === "FILE" ? fileDuration ?? 0 : ytDuration ?? 0;
    return Math.max(1, Math.ceil(duration / 30));
  }, [mode, fileDuration, ytDuration]);

  const youtubeValid = useMemo(() => {
    if (!youtubeUrl.trim()) return false;
    return youtubeUrl.trim().startsWith("http");
  }, [youtubeUrl]);

  const canSubmit = useMemo(() => {
    if (mode === "FILE") return Boolean(selectedFile) && !loading;
    return youtubeValid && !loading;
  }, [mode, selectedFile, youtubeValid, loading]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setMode("FILE");
    setError(null);
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
      setTabsResult(null);
    }
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleConvert = async () => {
    if (!session) {
      setError("Sign in to start transcribing.");
      signIn(undefined, { callbackUrl: "/" });
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
    setTabsResult(null);
    setStatus(mode === "FILE" ? "Transcribing audio..." : "Downloading from YouTube...");
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
        const payload: Record<string, unknown> = {
          mode: "YOUTUBE",
          youtubeUrl: youtubeUrl.trim(),
          separateGuitar: ytSeparateGuitar,
        };
        if (ytStartTime !== null) payload.startTime = ytStartTime;
        if (ytDuration !== null) payload.duration = ytDuration;
        response = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = (await response.json().catch(() => ({}))) as { error?: string } & TabsResponse;
      if (!response.ok) {
        if (data.credits) {
          setCredits(data.credits);
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
    }
  };

  const handlePricingClick = async () => {
    if (pricingBusy) return;
    if (!session) {
      signIn(undefined, { callbackUrl: "/#pricing" });
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
      <Head>
        <title>Note2Tab - Convert Music to Guitar Tabs</title>
        <meta name="description" content="Upload a song and get guitar tabs instantly." />
      </Head>

      <main className="page page-home">
        <section className="hero" id="hero">
          <div className="hero-glow hero-glow--one" aria-hidden="true" />
          <div className="hero-glow hero-glow--two" aria-hidden="true" />
          <div className="container hero-stack hero-stack--centered">
            <div className="hero-heading" data-reveal>
              <h1 className="hero-title">Turn Music Into Tabs</h1>
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
                      <span>
                        {selectedFile ? selectedFile.name : "Click to browse or drop a file."}
                      </span>
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

                {isSignedIn && (
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

              {isSignedIn && showAdvanced && (
                <div className="advanced-grid">
                  {mode === "YOUTUBE" && (
                    <>
                      <label>
                        Start time (sec)
                        <input
                          type="number"
                          value={ytStartTime ?? ""}
                          onChange={(event) => setYtStartTime(parseOptionalNumber(event.target.value))}
                        />
                      </label>
                      <label>
                        Duration (sec)
                        <input
                          type="number"
                          value={ytDuration ?? ""}
                          onChange={(event) => setYtDuration(parseOptionalNumber(event.target.value))}
                        />
                      </label>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={ytSeparateGuitar}
                          onChange={(event) => setYtSeparateGuitar(event.target.checked)}
                        />
                        Separate guitar stems
                      </label>
                    </>
                  )}
                  {mode === "FILE" && (
                    <>
                      <label>
                        Approx length (sec)
                        <input
                          type="number"
                          value={fileDuration ?? ""}
                          onChange={(event) => setFileDuration(parseOptionalNumber(event.target.value))}
                        />
                      </label>
                    </>
                  )}
                </div>
              )}

              <div className="prompt-actions">
                <button type="submit" className="button-primary" disabled={!canSubmit}>
                  {loading ? "Generating..." : "Generate tabs"}
                </button>
              </div>

              {status && <div className="status">{status}</div>}
              {error && <div className="error">{error}</div>}
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
                  <p>Copy the output or open the editor from your account.</p>
                </div>
                <div className="results-actions">
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() =>
                      void copyText(tabsResult.map((segment) => segment.join("\n")).join("\n\n---\n\n"))
                    }
                  >
                    Copy tabs
                  </button>
                  <Link href="/account" className="button-secondary">
                    Open account
                  </Link>
                </div>
              </div>
              <div className="results-grid">
                {tabsResult.map((segment, idx) => (
                  <pre key={idx} className="tab-block">
{segment.join("\n")}
                  </pre>
                ))}
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
                <h4>Fast start</h4>
                <p>Drop a song, get tabs in moments.</p>
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
                <h4>Readable output</h4>
                <p>Tabs stay clean and easy to scan.</p>
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
                <h4>Saved sessions</h4>
                <p>Everything stays in your account library.</p>
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
                <h3>1. Add audio</h3>
                <p>Drop a file or paste a link.</p>
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
                <h3>2. Generate tabs</h3>
                <p>We map timing and strings automatically.</p>
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
                <h3>3. Refine in GTE</h3>
                <p>Edit, fix, and save for later.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
