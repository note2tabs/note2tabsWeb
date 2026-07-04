import { useRef, useState, type ReactNode } from "react";
import { gteApi } from "../lib/gteApi";
import { TAB_IMPORT_ACCEPT, parseTabImportFile } from "../lib/gteTabImport";

type Props = {
  editorId?: string;
  createEditor?: (name: string) => Promise<string>;
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
    try {
      const parsed = await parseTabImportFile(file);
      const targetEditorId = editorId || (await createEditor?.(parsed.name));
      if (!targetEditorId) {
        throw new Error("Could not create an editor for this tab.");
      }
      await gteApi.importAsciiTab(targetEditorId, {
        text: parsed.text,
        name: parsed.name,
      });
      await onImported(targetEditorId);
    } catch (err: unknown) {
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
