import { useEffect, useState } from "react";
import { gteApi } from "../lib/gteApi";
import type { CanvasShare, SharedEditorRole } from "../types/gte";

type ShareDialogProps = {
  editorId: string;
  onClose: () => void;
};

export default function ShareDialog({ editorId, onClose }: ShareDialogProps) {
  const [shares, setShares] = useState<CanvasShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<SharedEditorRole>("editor");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    gteApi
      .listShares(editorId)
      .then((data) => {
        if (!cancelled) setShares(data.shares || []);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load current collaborators.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editorId]);

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await gteApi.createShare(editorId, trimmed, role);
      setShares((prev) => [
        ...prev.filter((s) => s.email.toLowerCase() !== created.email.toLowerCase()),
        { shareId: created.shareId, email: created.email, role: created.role, status: created.status, createdAt: created.createdAt },
      ]);
      setEmail("");
    } catch (err: any) {
      setError(err?.message || "Could not send the invite.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(shareId: number) {
    try {
      await gteApi.revokeShare(editorId, shareId);
      setShares((prev) => prev.filter((s) => s.shareId !== shareId));
    } catch {
      setError("Could not remove that collaborator. Try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Share this editor</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleInvite} className="mt-4 flex items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Collaborator's email"
            className="h-9 flex-1 rounded-md border border-slate-200 px-2 text-sm"
            disabled={submitting}
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as SharedEditorRole)}
            className="h-9 rounded-md border border-slate-200 px-2 text-xs font-semibold"
            disabled={submitting}
          >
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <button
            type="submit"
            disabled={submitting}
            className="h-9 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            {submitting ? "Inviting..." : "Invite"}
          </button>
        </form>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <div className="mt-4 max-h-64 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-slate-500">Loading collaborators...</p>
          ) : shares.length === 0 ? (
            <p className="text-xs text-slate-500">No one else has access yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {shares.map((share) => (
                <li key={share.shareId} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium text-slate-800">{share.email}</div>
                    <div className="text-xs text-slate-500">
                      {share.role === "editor" ? "Can edit" : "Can view"}
                      {share.status === "pending" ? " · invite pending" : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevoke(share.shareId)}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
