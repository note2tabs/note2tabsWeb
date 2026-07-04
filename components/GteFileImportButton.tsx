import { useRef, useState, type ReactNode } from "react";
import { buildLaneEditorRef, gteApi } from "../lib/gteApi";
import { TAB_IMPORT_ACCEPT, parseTabImportFile } from "../lib/gteTabImport";

type Props = {
  editorId?: string;
  createEditor?: (name: string) => Promise<{ editorId: string; laneId: string }>;
  onImported: (editorId: string) => void | Promise<void>;
  onError: (message: string) => void;
  className: string;
  disabled?: boolean;
  children: ReactNode;
  busyLabel?: ReactNode;
  title?: string;
};

export default function GteFileImportButton({
  editorId,
  createEditor,
  onImported,
  onError,
  className,
  disabled,
  children,
  busyLabel = "Importing...",
  title,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File | null) => {
    if (!file || busy) return;
    setBusy(true);
    onError("");
    let createdEditorId: string | null = null;
    let addedLaneId: string | null = null;
    try {
      const parsed = await parseTabImportFile(file);
      let targetEditorId = editorId;
      let targetLaneId: string | undefined;

      if (targetEditorId) {
        const added = await gteApi.addCanvasEditor(targetEditorId, parsed.name);
        targetLaneId = added.editor.id;
        addedLaneId = targetLaneId;
      } else {
        const created = await createEditor?.(parsed.name);
        targetEditorId = created?.editorId;
        targetLaneId = created?.laneId;
        createdEditorId = targetEditorId || null;
      }

      if (!targetEditorId || !targetLaneId) {
        throw new Error("Could not create an editor for this tab.");
      }
      await gteApi.importTab(buildLaneEditorRef(targetEditorId, targetLaneId), {
        stamps: parsed.stamps,
        framesPerMessure: parsed.framesPerMessure,
        fps: parsed.fps,
        totalFrames: parsed.totalFrames,
      });
      await onImported(targetEditorId);
    } catch (err: unknown) {
      if (editorId && addedLaneId) {
        await gteApi.deleteCanvasEditor(editorId, addedLaneId).catch(() => {});
      } else if (createdEditorId) {
        await gteApi.deleteEditor(createdEditorId).catch(() => {});
      }
      const message = err instanceof Error ? err.message : "Could not import this tab file.";
      onError(message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={TAB_IMPORT_ACCEPT}
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0] || null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={className}
        disabled={disabled || busy}
        title={title}
      >
        {busy ? busyLabel : children}
      </button>
    </>
  );
}
