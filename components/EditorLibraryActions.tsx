import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../lib/i18n/react";
import { translatedError } from "../lib/i18n/translate";
import { gteApi } from "../lib/gteApi";
import { buildGteExportFile, downloadGteExportFile, GTE_EXPORT_FORMAT_OPTIONS, type GteExportFormat } from "../lib/gteTabExport";
import type { EditorListItem, EditorSnapshot, TimingMapV2 } from "../types/gte";

type Props = { editor: EditorListItem; open: boolean; onOpenChange: (open: boolean) => void; onUpdated: (editor: EditorListItem | null) => void };
export default function EditorLibraryActions({ editor, open, onOpenChange, onUpdated }: Props) {
  const { t, locale } = useLocale();
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [action, setAction] = useState<"rename" | "delete" | "export" | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<EditorSnapshot[]>([]);
  const [timing, setTiming] = useState<TimingMapV2>();
  const [trackId, setTrackId] = useState("");
  const [format, setFormat] = useState<GteExportFormat>("txt");
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (event: MouseEvent) => { if (!menu.current?.contains(event.target as Node)) onOpenChange(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { onOpenChange(false); trigger.current?.focus(); } };
    window.addEventListener("mousedown", outside); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("mousedown", outside); window.removeEventListener("keydown", key); };
  }, [open, onOpenChange]);
  useEffect(() => {
    if (!action) return;
    dialogRef.current?.querySelector<HTMLElement>("input, select, button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { setAction(null); trigger.current?.focus(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("input:not(:disabled), select:not(:disabled), button:not(:disabled)") || []);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [action, busy]);
  const begin = async (next: NonNullable<typeof action>) => {
    onOpenChange(false); setError(null); setName(editor.name || "Untitled"); setAction(next);
    if (next !== "export") return;
    setBusy(true); setTracks([]);
    try {
      const data = await gteApi.getEditor(editor.id);
      const lanes = "editors" in data ? data.editors : [data];
      setTracks(lanes); setTrackId(lanes[0]?.id || ""); setTiming("timingMap" in data ? data.timingMap : undefined);
    } catch (err) { setError(err instanceof Error ? err.message : "We could not prepare this track for export. Your tab is unchanged; please try again."); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (action === "delete") { await gteApi.deleteEditor(editor.id); onUpdated(null); }
      else if (action === "rename") {
        const normalized = name.trim() || "Untitled";
        await gteApi.setEditorName(editor.id, normalized);
        const committed = await gteApi.commitEditor(editor.id);
        onUpdated({ ...editor, name: committed.snapshot?.name || normalized });
      } else {
        const track = tracks.find(item => item.id === trackId);
        if (!track) return;
        downloadGteExportFile(buildGteExportFile(track, format, timing));
      }
      setAction(null); trigger.current?.focus();
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  };
  return <>
    <div ref={menu} className="gte-library-row-menu" data-editor-row-menu="true">
      <button ref={trigger} type="button" className="button-secondary button-small editor-actions-trigger" aria-label={t("Options for {value1}", { value1: editor.name || t("Untitled tab") })} aria-expanded={open} aria-haspopup="menu" onClick={() => onOpenChange(!open)}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><circle cx="4" cy="9" r="1.25" /><circle cx="9" cy="9" r="1.25" /><circle cx="14" cy="9" r="1.25" /></svg></button>
      {open && <div className="editor-actions-menu" role="menu" onKeyDown={event => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }}>
        <button type="button" role="menuitem" className="editor-actions-menu-item" data-diagnostic-action="rename" onClick={() => void begin("rename")}>{t("Rename")}</button>
        <button type="button" role="menuitem" className="editor-actions-menu-item" data-diagnostic-action="export" onClick={() => void begin("export")}>{t("Export")}</button>
        <button type="button" role="menuitem" className="editor-actions-menu-item editor-actions-menu-item--danger" data-diagnostic-action="delete" onClick={() => void begin("delete")}>{t("Delete")}</button>
      </div>}
    </div>
    {action && createPortal(<div className="dialog-scrim" onMouseDown={() => { if (!busy) { setAction(null); trigger.current?.focus(); } }}>
      <div ref={dialogRef} dir={locale === "ar" ? "rtl" : undefined} className="dialog-card" role={action === "delete" ? "alertdialog" : "dialog"} aria-modal="true" aria-label={t(action === "rename" ? "Rename tab" : action === "delete" ? "Delete tab?" : "Export")} onMouseDown={event => event.stopPropagation()}>
        <h2>{t(action === "rename" ? "Rename tab" : action === "delete" ? "Delete tab?" : "Export")}</h2>
        {action === "rename" && <input className="form-input" aria-label={t("Tab name")} value={name} disabled={busy} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void submit(); }} />}
        {action === "delete" && <p>{t('Delete "')}{editor.name || t("Untitled")}{t('"? This cannot be undone.')}</p>}
        {action === "export" && <div className="stack-tight">
          {tracks.length > 1 && <select className="form-input" aria-label={t("Track")} value={trackId} disabled={busy} onChange={event => setTrackId(event.target.value)}>{tracks.map(track => <option key={track.id} value={track.id}>{track.name || t("Untitled")}</option>)}</select>}
          <select className="form-input" aria-label={t("Export")} value={format} disabled={busy} onChange={event => setFormat(event.target.value as GteExportFormat)}>{GTE_EXPORT_FORMAT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        </div>}
        {error && <p role="alert">{translatedError(error, locale)}</p>}
        <div className="button-row">
          <button type="button" className="button-secondary button-small" disabled={busy} onClick={() => { setAction(null); trigger.current?.focus(); }}>{t("Cancel")}</button>
          <button type="button" className={action === "delete" ? "button-secondary button-small button-delete-final" : "button-primary button-small"} disabled={busy || (action === "export" && !tracks.length)} data-diagnostic-action={action || undefined} onClick={() => void submit()}>{busy ? t("Loading…") : t(action === "rename" ? "Save tab name" : action === "delete" ? "Delete" : "Export")}</button>
        </div>
      </div>
    </div>, document.body)}
  </>;
}
