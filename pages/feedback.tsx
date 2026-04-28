import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./api/auth/[...nextauth]";

type Props = {
  userEmail: string;
};

const CATEGORY_OPTIONS = [
  { value: "general", label: "General" },
  { value: "bug", label: "Bug report" },
  { value: "feature", label: "Feature request" },
  { value: "ui", label: "UI/UX feedback" },
] as const;

export default function FeedbackPage({ userEmail }: Props) {
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]["value"]>("general");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = message.trim().length >= 10 && !busy;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (trimmed.length < 10) {
      setError("Please write at least 10 characters.");
      return;
    }
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          message: trimmed,
          pagePath: window.location.pathname,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Could not send feedback.");
      }
      setMessage("");
      setStatus("Thank you for your message, we really appriciate it :)");
    } catch (err: any) {
      setError(err?.message || "Could not send feedback.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Head>
        <title>Feedback - Note2Tabs</title>
      </Head>
      <main className="page page-tight">
        <div className="container stack" style={{ maxWidth: 760 }}>
          <div className="page-header">
            <div>
              <h1 className="page-title">Feedback</h1>
              <p className="page-subtitle">If you have anything on your mind regarding note2tabs please let us know.</p>
            </div>
          </div>

          <section className="card stack">
            <p className="muted text-small">Signed in as {userEmail}</p>
            <form className="stack" onSubmit={handleSubmit}>
              <label className="form-group">
                <span className="label">Type</span>
                <select
                  className="form-select"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as typeof category)}
                  disabled={busy}
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-group">
                <span className="label">Message</span>
                <textarea
                  className="form-textarea"
                  rows={8}
                  maxLength={2000}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Write your message here..."
                  disabled={busy}
                />
                <span className="muted text-small">{message.length} / 2000</span>
              </label>

              <div className="button-row">
                <button type="submit" className="button-primary" disabled={!canSubmit}>
                  {busy ? "Sending..." : "Send feedback"}
                </button>
              </div>
            </form>
            {status && <div className="status">{status}</div>}
            {error && <div className="error">{error}</div>}
          </section>
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id || !session.user.email) {
    const next = encodeURIComponent("/feedback");
    return {
      redirect: {
        destination: `/auth/login?next=${next}`,
        permanent: false,
      },
    };
  }

  return {
    props: {
      userEmail: session.user.email,
    },
  };
};
