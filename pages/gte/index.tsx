import { editorName } from "../../lib/i18n/editor/names";
import { withEditorLocale } from "../../lib/i18n/editor/request";
import { translatedError } from "../../lib/i18n/translate";
import { useLocale } from "../../lib/i18n/react";
import { GetServerSideProps } from "next";
import Link from "../../components/LocaleLink";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { useLocaleRouter as useRouter } from "../../lib/i18n/react";
import { gteApi } from "../../lib/gteApi";
import type { EditorListItem, EditorSnapshot } from "../../types/gte";
import { clearGuestDraft, GTE_GUEST_EDITOR_ID, readGuestDraft } from "../../lib/gteGuestDraft";
import NoIndexHead from "../../components/NoIndexHead";
import GteFileImportButton from "../../components/GteFileImportButton";
import { EditorLibraryLoadingState } from "../../components/EditorLoadingState";
import {
  invalidateEditorListCache,
  readEditorListCache,
  writeEditorListCache as persistEditorListCache,
} from "../../lib/gteEditorListCache";

type Props = {
  userId: string;
};

export default function GteIndexPage({ userId }: Props) {
  const { t, locale } = useLocale();
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

  const writeEditorListCache = useCallback(
    (items: EditorListItem[]) => {
      persistEditorListCache(window.sessionStorage, userId, items);
    },
    [userId]
  );

  const loadEditors = async (showLoading: boolean = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await gteApi.listEditors();
      const nextEditors = data.editors || [];
      setEditors(nextEditors);
      writeEditorListCache(nextEditors);
    } catch (err: any) {
      setError(err?.message || "We could not load your tabs. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let hasCachedEditors = false;
    let cacheIsFresh = false;
    const cached = readEditorListCache(window.sessionStorage, userId);
    if (cached.editors) {
      setEditors(cached.editors);
      setLoading(false);
      hasCachedEditors = true;
      cacheIsFresh = cached.isFresh;
    }
    if (!cacheIsFresh) {
      void loadEditors(!hasCachedEditors);
    }
  }, [userId]);

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
      invalidateEditorListCache(window.sessionStorage, userId);
      await router.push(`/gte/${data.editorId}`);
    } catch (err: any) {
      setError(err?.message || "We could not create a new tab. Check your connection and try again.");
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
      setEditors((prev) => {
        const next = prev.filter((item) => item.id !== editor.id);
        writeEditorListCache(next);
        return next;
      });
      setDeleteDialog((prev) => (prev?.id === editor.id ? null : prev));
    } catch (err: any) {
      setError(err?.message || "We could not delete this tab. It is still in your library; please try again.");
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
      setEditors((prev) => {
        const next = prev.map((item) =>
          item.id === editorId
            ? {
                ...item,
                name: updatedName,
              }
            : item
        );
        writeEditorListCache(next);
        return next;
      });
      setRenameDialog(null);
    } catch (err: any) {
      setError(err?.message || "We could not rename this tab. Its previous name is unchanged; please try again.");
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
      setError(
        err?.message ||
          "We could not save this browser draft to your account. The draft is still on this device; please try again."
      );
    } finally {
      setGuestImporting(false);
    }
  };

  const handleDiscardGuestDraft = async () => {
    if (!guestDraft) return;
    if (!window.confirm(t("Discard your guest draft? This cannot be undone."))) return;
    await gteApi.deleteEditor(GTE_GUEST_EDITOR_ID).catch(() => {});
    clearGuestDraft();
    setGuestDraft(null);
  };

  return (
    <>
      <NoIndexHead title={t("Guitar Tab Editor Library | Note2Tabs")} canonicalPath="/gte" />
    <main className="page">
      <div className="container stack">
        <div className="page-header">
          <div>
            <h1 className="page-title">{t("Guitar Tab Editor")}</h1>
            <p className="page-subtitle">{t("Open your tabs, start a new arrangement, or import work made elsewhere.")}</p>
          </div>
          <div className="button-row">
            <GteFileImportButton
              className="button-secondary button-small"
              disabled={creating}
              createEditor={async (name) => {
                const data = await gteApi.createEditor(undefined, name || "Imported tab");
                return {
                  editorId: data.editorId,
                  laneId: data.snapshot.editors[0]?.id || "ed-1",
                };
              }}
              onImported={async (importedEditorId) => {
                await router.push(`/gte/${importedEditorId}`);
              }}
              onError={(message) => setError(message || null)}
              busyLabel="Importing..."
              title={t("Import a tab file")}
            >{t("Import tabs")}</GteFileImportButton>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="button-primary button-small"
            >
              {creating ? t("Creating...") : t("New tab")}
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
                  <p className="tabs-row-main-title">{t("Guest draft found")}{guestDraft.name ? t(": {value1}", {value1: guestDraft.name}) : ""}
                  </p>
                  <p className="muted text-small tabs-row-main-meta">{t("Import it into your account so it shows up in your library.")}</p>
                </div>
                <div className="button-row">
                  <button
                    type="button"
                    className="button-primary button-small"
                    onClick={() => void handleImportGuestDraft()}
                    disabled={guestImporting}
                  >
                    {guestImporting ? t("Importing...") : t("Import draft")}
                  </button>
                  <Link href={`/gte/${GTE_GUEST_EDITOR_ID}`} className="button-secondary button-small">{t("Keep editing in guest mode")}</Link>
                  <button
                    type="button"
                    className="button-secondary button-small"
                    onClick={() => void handleDiscardGuestDraft()}
                    disabled={guestImporting}
                  >{t("Discard draft")}</button>
                </div>
              </div>
            </div>
          )}
          {loading && <EditorLibraryLoadingState />}
          {error && (
            <div className="error flex flex-wrap items-center justify-between gap-3" role="alert">
              <span>{translatedError(error, locale)}</span>
              <button type="button" className="button-secondary button-small" onClick={() => void loadEditors(true)}>{t("Try again")}</button>
            </div>
          )}
          {!loading && !editors.length && (
            <div className="blog-empty stack-tight">
              <strong>{t("Your tab library is ready.")}</strong>
              <span>{t("Create a blank tab, import an existing file, or transcribe a recording to begin.")}</span>
              <div className="button-row">
                <button type="button" className="button-primary button-small" onClick={handleCreate} disabled={creating}>
                  {creating ? t("Creating…") : t("Create a blank tab")}
                </button>
                <Link href="/transcribe" className="button-secondary button-small">{t("Transcribe a recording")}</Link>
              </div>
            </div>
          )}
          <div className="gte-library-grid">
            {editors.map((editor) => (
              <div key={editor.id} className="card-outline gte-library-row">
                <Link
                  href={`/gte/${editor.id}`}
                  className="gte-library-row-link"
                  aria-label={t("Open {value1}", {value1: editorName(editor.name, t) || t("Untitled tab")})}
                  onPointerDown={() => {
                    void gteApi.prefetchEditor(editor.id).catch(() => undefined);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void gteApi.prefetchEditor(editor.id).catch(() => undefined);
                    }
                  }}
                >
                  <span className="sr-only">{t("Open ")}{editorName(editor.name, t) || t("Untitled tab")}</span>
                </Link>
                <div className="gte-library-card-head">
                  <h2 className="gte-library-card-title">{editorName(editor.name, t) || t("Untitled")}</h2>
                </div>
                <div className="muted text-small gte-library-meta">
                  <p>{editor.noteCount ?? 0}{t(" notes · ")}{editor.chordCount ?? 0}{t(" chords")}</p>
                  {editor.updatedAt && <p><time dateTime={editor.updatedAt}>{t("Updated ")}{new Date(editor.updatedAt).toLocaleString(locale)}</time></p>}
                </div>
                <div className="gte-library-row-menu" data-editor-row-menu="true">
                  <div style={{ position: "relative" }}>
                    <button
                      type="button"
                      className="button-secondary button-small"
                      onClick={() => setOpenMenuId((prev) => (prev === editor.id ? null : editor.id))}
                      aria-label={t("Options for {value1}", {value1: editorName(editor.name, t) || t("Untitled tab")})}
                      aria-expanded={openMenuId === editor.id}
                      aria-haspopup="menu"
                      title={t("Tab options")}
                    >
                      <span aria-hidden="true">⋯</span>
                    </button>
                    {openMenuId === editor.id && (
                      <div className="editor-actions-menu" role="menu">
                        <button
                          type="button"
                          className="editor-actions-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setOpenMenuId(null);
                            setRenameDialog({ id: editor.id, name: editor.name || "Untitled" });
                          }}
                          disabled={renamingId === editor.id || deletingId === editor.id}
                        >{t("Rename")}</button>
                        <button
                          type="button"
                          className="editor-actions-menu-item editor-actions-menu-item--danger"
                          role="menuitem"
                          onClick={() => {
                            setOpenMenuId(null);
                            setDeleteDialog(editor);
                          }}
                          disabled={deletingId === editor.id || renamingId === editor.id}
                        >{t("Delete")}</button>
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
          <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="rename-tab-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="stack-tight">
              <h2 id="rename-tab-title" className="page-title" style={{ fontSize: "1.25rem" }}>{t("Rename tab")}</h2>
              <p className="muted text-small">{t("Choose a new name for this editor.")}</p>
            </div>
            <div className="stack-tight">
              <input
                type="text"
                aria-label={t("Tab name")}
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
              >{t("Cancel")}</button>
              <button
                type="button"
                className="button-primary button-small"
                onClick={() => void handleRename(renameDialog.id, renameDialog.name)}
                disabled={Boolean(renamingId)}
              >
                {renamingId ? t("Renaming...") : t("Save")}
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteDialog && (
        <div className="dialog-scrim" onMouseDown={() => !deletingId && setDeleteDialog(null)}>
          <div className="dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="delete-tab-title" aria-describedby="delete-tab-description" onMouseDown={(event) => event.stopPropagation()}>
            <div className="stack-tight">
              <h2 id="delete-tab-title" className="page-title" style={{ fontSize: "1.25rem" }}>{t("Delete tab?")}</h2>
              <p id="delete-tab-description" className="muted text-small">{t("Delete \"")}{deleteDialog.name || t("Untitled")}{t("\"? This cannot be undone.")}</p>
            </div>
            <div className="button-row" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="button-secondary button-small"
                onClick={() => setDeleteDialog(null)}
                disabled={Boolean(deletingId)}
              >{t("Cancel")}</button>
              <button
                type="button"
                className="button-secondary button-small button-delete-final"
                onClick={() => void handleDelete(deleteDialog)}
                disabled={Boolean(deletingId)}
              >
                {deletingId ? t("Deleting...") : t("Delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = withEditorLocale(async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id) {
    return {
      redirect: {
        destination: `/gte/${GTE_GUEST_EDITOR_ID}`,
        permanent: false,
      },
    };
  }
  return { props: { userId: session.user.id } };
});
