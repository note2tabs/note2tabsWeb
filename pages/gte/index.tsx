import { GetServerSideProps } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { useRouter } from "next/router";
import { gteApi } from "../../lib/gteApi";
import type { EditorListItem, EditorSnapshot } from "../../types/gte";
import { clearGuestDraft, GTE_GUEST_EDITOR_ID, readGuestDraft } from "../../lib/gteGuestDraft";
import NoIndexHead from "../../components/NoIndexHead";

export default function GteIndexPage() {
  const [editors, setEditors] = useState<EditorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renameDialog, setRenameDialog] = useState<{ id: string; name: string } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<EditorListItem | null>(null);
  const [guestDraft, setGuestDraft] = useState<EditorSnapshot | null>(null);
  const [guestImporting, setGuestImporting] = useState(false);
  const router = useRouter();
  const highlightGuestImport = useMemo(() => {
    if (!router.isReady) return false;
    const raw = router.query.importGuest;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value === "1" || value === "true";
  }, [router.isReady, router.query.importGuest]);

  const hasGuestDraftContent = useCallback((snapshot: EditorSnapshot | null) => {
    if (!snapshot) return false;
    if (snapshot.notes.length > 0 || snapshot.chords.length > 0) return true;
    if (snapshot.cutPositionsWithCoords.length > 1) return true;
    if ((snapshot.name || "Untitled") !== "Untitled") return true;
    return false;
  }, []);

  const loadGuestDraft = useCallback(async () => {
    try {
      const data = await gteApi.getEditor(GTE_GUEST_EDITOR_ID);
      if (data && typeof data === "object" && Array.isArray((data as any).editors)) {
        const canvas = data as any;
        const lane = canvas.editors?.[0];
        if (lane) {
          const snapshot: EditorSnapshot = {
            ...lane,
            id: GTE_GUEST_EDITOR_ID,
            name: canvas.name || lane.name || "Untitled",
            secondsPerBar: canvas.secondsPerBar ?? lane.secondsPerBar,
          };
          if (hasGuestDraftContent(snapshot)) {
            setGuestDraft(snapshot);
            return snapshot;
          }
        }
      }
    } catch {
      // fall back to legacy browser storage below
    }

    const legacy = readGuestDraft();
    const nextLegacy = hasGuestDraftContent(legacy) ? legacy : null;
    setGuestDraft(nextLegacy);
    return nextLegacy;
  }, [hasGuestDraftContent]);

  const loadEditors = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await gteApi.listEditors();
      setEditors(data.editors || []);
    } catch (err: any) {
      setError(err?.message || "Could not load editors.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEditors();
  }, []);

  useEffect(() => {
    const refresh = () => {
      void loadGuestDraft();
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [loadGuestDraft]);

  useEffect(() => {
    if (!openMenuId) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-editor-row-menu='true']")) return;
      setOpenMenuId(null);
    };
    window.addEventListener("mousedown", handlePointerDown, true);
    return () => window.removeEventListener("mousedown", handlePointerDown, true);
  }, [openMenuId]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const data = await gteApi.createEditor();
      await router.push(`/gte/${data.editorId}`);
    } catch (err: any) {
      setError(err?.message || "Could not create editor.");
      setCreating(false);
    }
  };

  const handleDelete = async (editor: EditorListItem) => {
    if (deletingId) return;
    setDeletingId(editor.id);
    setOpenMenuId(null);
    setError(null);
    try {
      await gteApi.deleteEditor(editor.id);
      setEditors((prev) => prev.filter((item) => item.id !== editor.id));
      setDeleteDialog((prev) => (prev?.id === editor.id ? null : prev));
    } catch (err: any) {
      setError(err?.message || "Could not delete editor.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleRename = async (editorId: string, rawName: string) => {
    if (renamingId) return;
    const currentEditor = editors.find((item) => item.id === editorId);
    const currentName = currentEditor?.name || "Untitled";
    const trimmed = rawName.trim();
    const normalizedName = trimmed || "Untitled";
    if (normalizedName === currentName) {
      setRenameDialog(null);
      setOpenMenuId(null);
      return;
    }
    setRenamingId(editorId);
    setOpenMenuId(null);
    setError(null);
    try {
      const res = await gteApi.setEditorName(editorId, normalizedName);
      const committed = await gteApi.commitEditor(editorId);
      const updatedName =
        committed.snapshot?.name ||
        (res as any)?.canvas?.name ||
        (res as any)?.snapshot?.name ||
        normalizedName;
      setEditors((prev) =>
        prev.map((item) =>
          item.id === editorId
            ? {
                ...item,
                name: updatedName,
              }
            : item
        )
      );
      setRenameDialog(null);
    } catch (err: any) {
      setError(err?.message || "Could not rename editor.");
    } finally {
      setRenamingId(null);
    }
  };

  const handleImportGuestDraft = async () => {
    if (guestImporting) return;
    const draft = guestDraft ?? (await loadGuestDraft());
    if (!draft) {
      setGuestDraft(null);
      setError("No guest draft found to import.");
      return;
    }
    setGuestImporting(true);
    setError(null);
    try {
      const created = await gteApi.createEditor(undefined, draft.name || "Untitled");
      const uniqueName = created.snapshot?.name || draft.name || "Untitled";
      const payload = {
        id: created.editorId,
        name: uniqueName,
        secondsPerBar: draft.secondsPerBar,
        editors: [{ ...draft, id: "ed-1", name: uniqueName || "Editor 1" }],
      };
      await gteApi.applySnapshot(created.editorId, payload as any);
      await gteApi.commitEditor(created.editorId);
      await gteApi.deleteEditor(GTE_GUEST_EDITOR_ID).catch(() => {});
      clearGuestDraft();
      setGuestDraft(null);
      await router.push(`/gte/${created.editorId}`);
    } catch (err: any) {
      setError(err?.message || "Could not import guest draft.");
    } finally {
      setGuestImporting(false);
    }
  };

  const handleDiscardGuestDraft = async () => {
    if (!guestDraft) return;
    if (!window.confirm("Discard your guest draft? This cannot be undone.")) return;
    await gteApi.deleteEditor(GTE_GUEST_EDITOR_ID).catch(() => {});
    clearGuestDraft();
    setGuestDraft(null);
  };

  return (
    <>
      <NoIndexHead title="Guitar Tab Editor Library | Note2Tabs" canonicalPath="/gte" />
    <main className="page">
      <div className="container stack">
        <div className="page-header">
          <div>
            <h1 className="page-title">Guitar Tab Editor</h1>
            <p className="page-subtitle">Open transcriptions, start a new tab, or bring in a draft you made earlier.</p>
          </div>
          <div className="button-row">
            <button type="button" onClick={handleCreate} disabled={creating} className="button-primary button-small">
              {creating ? "Creating..." : "New tab"}
            </button>
          </div>
        </div>

        <section className="card stack">
          {guestDraft && (
            <div
              className="notice"
              style={highlightGuestImport ? { borderColor: "#16a34a", boxShadow: "0 0 0 1px #16a34a" } : undefined}
            >
              <div className="page-header">
                <div>
                  <p className="tabs-row-main-title">
                    Guest draft found{guestDraft.name ? `: ${guestDraft.name}` : ""}
                  </p>
                  <p className="muted text-small tabs-row-main-meta">
                    Import it into your account so it shows up in your library.
                  </p>
                </div>
                <div className="button-row">
                  <button
                    type="button"
                    className="button-primary button-small"
                    onClick={() => void handleImportGuestDraft()}
                    disabled={guestImporting}
                  >
                    {guestImporting ? "Importing..." : "Import draft"}
                  </button>
                  <Link href={`/gte/${GTE_GUEST_EDITOR_ID}`} className="button-secondary button-small">
                    Keep editing in guest mode
                  </Link>
                  <button
                    type="button"
                    className="button-secondary button-small"
                    onClick={() => void handleDiscardGuestDraft()}
                    disabled={guestImporting}
                  >
                    Discard draft
                  </button>
                </div>
              </div>
            </div>
          )}
          {loading && <p className="muted text-small">Loading editors...</p>}
          {error && <div className="error">{error}</div>}
          {!loading && !editors.length && (
            <p className="muted text-small">No transcriptions yet. Start your first one.</p>
          )}
          <div className="gte-library-grid">
            {editors.map((editor) => (
              <div key={editor.id} className="card-outline gte-library-row">
                <div className="gte-library-card-head">
                  <h2 className="gte-library-card-title">
                    <Link href={`/gte/${editor.id}`}>
                      {editor.name || "Untitled"}
                    </Link>
                  </h2>
                </div>
                <div className="muted text-small gte-library-meta">
                  <p>Notes: {editor.noteCount ?? 0} - Chords: {editor.chordCount ?? 0}</p>
                  {editor.updatedAt && <p>Updated: {new Date(editor.updatedAt).toLocaleString()}</p>}
                </div>
                <div className="gte-library-row-menu" data-editor-row-menu="true">
                  <div style={{ position: "relative" }}>
                    <button
                      type="button"
                      className="button-secondary button-small"
                      onClick={() => setOpenMenuId((prev) => (prev === editor.id ? null : editor.id))}
                      aria-label="Editor options"
                      title="Editor options"
                    >
                      ...
                    </button>
                    {openMenuId === editor.id && (
                      <div className="editor-actions-menu">
                        <button
                          type="button"
                          className="editor-actions-menu-item"
                          onClick={() => {
                            setOpenMenuId(null);
                            setRenameDialog({ id: editor.id, name: editor.name || "Untitled" });
                          }}
                          disabled={renamingId === editor.id || deletingId === editor.id}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="editor-actions-menu-item editor-actions-menu-item--danger"
                          onClick={() => {
                            setOpenMenuId(null);
                            setDeleteDialog(editor);
                          }}
                          disabled={deletingId === editor.id || renamingId === editor.id}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      {renameDialog && (
        <div className="dialog-scrim" onMouseDown={() => !renamingId && setRenameDialog(null)}>
          <div className="dialog-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="stack-tight">
              <h2 className="page-title" style={{ fontSize: "1.25rem" }}>Rename tab</h2>
              <p className="muted text-small">Choose a new name for this editor.</p>
            </div>
            <div className="stack-tight">
              <input
                type="text"
                value={renameDialog.name}
                onChange={(event) =>
                  setRenameDialog((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                }
                className="form-input"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleRename(renameDialog.id, renameDialog.name);
                  } else if (event.key === "Escape" && !renamingId) {
                    setRenameDialog(null);
                  }
                }}
              />
            </div>
            <div className="button-row" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="button-secondary button-small"
                onClick={() => setRenameDialog(null)}
                disabled={Boolean(renamingId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-primary button-small"
                onClick={() => void handleRename(renameDialog.id, renameDialog.name)}
                disabled={Boolean(renamingId)}
              >
                {renamingId ? "Renaming..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteDialog && (
        <div className="dialog-scrim" onMouseDown={() => !deletingId && setDeleteDialog(null)}>
          <div className="dialog-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="stack-tight">
              <h2 className="page-title" style={{ fontSize: "1.25rem" }}>Delete tab?</h2>
              <p className="muted text-small">
                Delete "{deleteDialog.name || "Untitled"}"? This cannot be undone.
              </p>
            </div>
            <div className="button-row" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="button-secondary button-small"
                onClick={() => setDeleteDialog(null)}
                disabled={Boolean(deletingId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-secondary button-small button-delete-final"
                onClick={() => void handleDelete(deleteDialog)}
                disabled={Boolean(deletingId)}
              >
                {deletingId ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id) {
    return {
      redirect: {
        destination: `/gte/${GTE_GUEST_EDITOR_ID}`,
        permanent: false,
      },
    };
  }
  return { props: {} };
};
