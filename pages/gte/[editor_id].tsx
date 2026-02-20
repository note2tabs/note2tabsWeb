import { GetServerSideProps } from "next";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getServerSession } from "next-auth/next";
import { useSession } from "next-auth/react";
import { authOptions } from "../api/auth/[...nextauth]";
import { useRouter } from "next/router";
import { gteApi } from "../../lib/gteApi";
import type { EditorSnapshot } from "../../types/gte";
import GteWorkspace from "../../components/GteWorkspace";
import {
  GTE_GUEST_EDITOR_ID,
  createGuestSnapshot,
  readGuestDraft,
  writeGuestDraft,
} from "../../lib/gteGuestDraft";

type Props = {
  editorId: string;
  isGuestMode: boolean;
};

export default function GteEditorPage({ editorId, isGuestMode }: Props) {
  const { data: session } = useSession();
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const telemetrySessionRef = useRef<string | null>(null);
  const telemetryStartedAtRef = useRef<number | null>(null);
  const telemetryClosedRef = useRef(false);
  const router = useRouter();
  const saveToAccountPath = "/gte?importGuest=1";
  const loginSaveHref = `/auth/login?next=${encodeURIComponent(saveToAccountPath)}`;
  const signupSaveHref = `/auth/signup?next=${encodeURIComponent(saveToAccountPath)}`;

  const loadEditor = async () => {
    if (isGuestMode) return;
    setLoading(true);
    setError(null);
    try {
      const data = await gteApi.getEditor(editorId);
      setSnapshot(data);
    } catch (err: any) {
      setError(err?.message || "Could not load editor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!editorId) return;
    if (isGuestMode) {
      setLoading(true);
      setError(null);
      const localSnapshot = readGuestDraft() ?? createGuestSnapshot(editorId);
      localSnapshot.id = editorId;
      setSnapshot(localSnapshot);
      setLoading(false);
      return;
    }
    void loadEditor();
  }, [editorId, isGuestMode]);

  useEffect(() => {
    if (!editorId || isGuestMode) return;

    const createSessionId = () => {
      if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
      }
      return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    };

    const sessionId = createSessionId();
    telemetrySessionRef.current = sessionId;
    telemetryStartedAtRef.current = Date.now();
    telemetryClosedRef.current = false;

    const sendTelemetry = (
      event: "gte_editor_visit" | "gte_editor_session_start" | "gte_editor_session_end",
      durationSec?: number
    ) => {
      const payload = {
        event,
        editorId,
        sessionId,
        path: window.location.pathname,
        ...(durationSec !== undefined ? { durationSec } : {}),
      };
      return fetch("/api/gte/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    };

    void sendTelemetry("gte_editor_visit").catch(() => {});
    void sendTelemetry("gte_editor_session_start").catch(() => {});

    const flushSessionEnd = () => {
      if (telemetryClosedRef.current) return;
      telemetryClosedRef.current = true;
      const startedAt = telemetryStartedAtRef.current ?? Date.now();
      const durationSec = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      const payload = JSON.stringify({
        event: "gte_editor_session_end",
        editorId,
        sessionId,
        durationSec,
        path: window.location.pathname,
      });

      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/gte/telemetry", blob);
        return;
      }

      void fetch("/api/gte/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    };

    const handlePageHide = () => flushSessionEnd();
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      flushSessionEnd();
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [editorId, isGuestMode]);

  useEffect(() => {
    if (snapshot?.name) {
      setNameDraft(snapshot.name);
    } else if (snapshot) {
      setNameDraft("Untitled");
    }
  }, [snapshot?.name]);

  useEffect(() => {
    if (!isGuestMode || !snapshot) return;
    writeGuestDraft({
      ...snapshot,
      id: GTE_GUEST_EDITOR_ID,
      updatedAt: new Date().toISOString(),
    });
  }, [isGuestMode, snapshot]);

  const commitName = async () => {
    if (!snapshot) return;
    const trimmed = nameDraft.trim();
    const normalized = trimmed || "Untitled";
    if (normalized === (snapshot.name || "Untitled")) return;
    if (isGuestMode) {
      const next = {
        ...snapshot,
        name: normalized,
        updatedAt: new Date().toISOString(),
      };
      setNameDraft(normalized);
      setSnapshot(next);
      return;
    }
    setNameSaving(true);
    setNameError(null);
    try {
      const res = await gteApi.setEditorName(editorId, normalized);
      setSnapshot(res.snapshot);
    } catch (err: any) {
      setNameError(err?.message || "Could not update name.");
    } finally {
      setNameSaving(false);
    }
  };

  return (
    <main className="page page-tight">
      <div className="container gte-wide stack">
        <div className="page-header">
          <div>
            <h1 className="page-title">GTE Workspace</h1>
            <div className="page-subtitle" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="text"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={() => void commitName()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void commitName();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setNameDraft(snapshot?.name || "Untitled");
                  }
                }}
                className="w-64 max-w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                placeholder="Untitled"
              />
              {nameSaving && !isGuestMode && <span className="muted text-small">Saving...</span>}
              {nameError && <span className="error text-small">{nameError}</span>}
            </div>
          </div>
          <div className="button-row">
            {isGuestMode ? (
              <>
                <Link href="/" className="button-secondary button-small">
                  Back home
                </Link>
                {session?.user?.id ? (
                  <button
                    type="button"
                    onClick={() => void router.push(saveToAccountPath)}
                    className="button-primary button-small"
                  >
                    Save draft to account
                  </button>
                ) : (
                  <>
                    <Link href={loginSaveHref} className="button-secondary button-small">
                      Log in to save
                    </Link>
                    <Link href={signupSaveHref} className="button-primary button-small">
                      Create account
                    </Link>
                  </>
                )}
              </>
            ) : (
              <>
                <button type="button" onClick={() => router.push("/gte")} className="button-secondary button-small">
                  Back to editors
                </button>
                <Link href="/account" className="button-secondary button-small">
                  Account
                </Link>
              </>
            )}
          </div>
        </div>

        {isGuestMode && (
          <div className="notice">
            Guest mode is local-only. This draft is saved in your browser until you import it into an account.
          </div>
        )}
        {loading && <p className="muted text-small">Loading editor...</p>}
        {error && <div className="error">{error}</div>}
        {snapshot && (
          <GteWorkspace
            editorId={editorId}
            snapshot={snapshot}
            onSnapshotChange={setSnapshot}
            allowBackend={!isGuestMode}
          />
        )}
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const editorId = `${ctx.params?.editor_id || ""}`;
  const normalizedEditorId = editorId.trim().toLowerCase();
  if (normalizedEditorId === GTE_GUEST_EDITOR_ID) {
    return { props: { editorId: GTE_GUEST_EDITOR_ID, isGuestMode: true } };
  }

  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id) {
    return {
      redirect: {
        destination: "/auth/login",
        permanent: false,
      },
    };
  }
  return { props: { editorId, isGuestMode: false } };
};
