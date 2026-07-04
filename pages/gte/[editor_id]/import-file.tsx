import { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { useRouter } from "next/router";
import { useMemo, useRef, useState } from "react";
import NoIndexHead from "../../../components/NoIndexHead";
import { gteApi } from "../../../lib/gteApi";
import {
  TAB_IMPORT_ACCEPT,
  TAB_IMPORT_SUPPORTED_FORMATS,
  canParseWithAlphaTab,
  getImportNameFromFile,
  getTabImportExtension,
  getUnsupportedTabImportMessage,
  isRecognizedTabImportExtension,
  parseAlphaTabFileImport,
  parseMidiTabImport,
  parseMusicXmlTabImport,
  parseTextTabImport,
} from "../../../lib/gteTabImport";
import { authOptions } from "../../api/auth/[...nextauth]";

type Props = {
  editorId: string;
};

export default function ImportFileTabPage({ editorId }: Props) {
  const router = useRouter();
  const [name, setName] = useState("Imported file tab");
  const [tabText, setTabText] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const supportedFormatsText = useMemo(() => TAB_IMPORT_SUPPORTED_FORMATS.join(", "), []);

  const handleFileSelect = async (file: File | null) => {
    if (!file) return;
    const extension = getTabImportExtension(file.name);
    setSelectedFileName(file.name);
    setName((current) => {
      if (current.trim() && current !== "Imported file tab") return current;
      return getImportNameFromFile(file.name);
    });
    setError(null);
    setNotice(null);
    setTabText("");

    try {
      if (!isRecognizedTabImportExtension(extension)) {
        throw new Error(getUnsupportedTabImportMessage(file.name));
      }

      if (extension === "mid" || extension === "midi") {
        const parsed = parseMidiTabImport(await file.arrayBuffer());
        setTabText(parsed.text);
        setNotice(parsed.warning || `Loaded ${file.name}.`);
        return;
      }

      if (canParseWithAlphaTab(extension)) {
        try {
          const parsed = await parseAlphaTabFileImport(await file.arrayBuffer());
          setTabText(parsed.text);
          setNotice(parsed.warning || `Loaded ${file.name}.`);
          return;
        } catch (alphaTabError) {
          if (extension !== "xml" && extension !== "musicxml") {
            throw alphaTabError;
          }
        }
      }

      if (extension === "xml" || extension === "musicxml") {
        const parsed = parseMusicXmlTabImport(await file.text());
        setTabText(parsed.text);
        setNotice(parsed.warning || `Loaded ${file.name}.`);
        return;
      }

      if (extension === "txt" || extension === "text" || extension === "tab" || extension === "asc") {
        const parsed = parseTextTabImport(await file.text());
        setTabText(parsed.text);
        setNotice(`Loaded ${file.name}.`);
        return;
      }

      throw new Error(getUnsupportedTabImportMessage(file.name));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not read this tab file.";
      setError(message);
      setNotice(null);
    }
  };

  const handleImport = async () => {
    const text = tabText.trim();
    if (!text) {
      setError("Choose a supported tab file before importing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await gteApi.importAsciiTab(editorId, {
        text,
        name: name.trim() || "Imported file tab",
      });
      await router.push(`/gte/${editorId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not import this tab file.";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <NoIndexHead title="Import tab file | Note2Tabs" canonicalPath={`/gte/${editorId}/import-file`} />
      <main className="content py-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void router.push(`/gte/${editorId}`)}
              className="button-secondary button-small"
            >
              Back to editor
            </button>
            <Link href={`/gte/${editorId}/import-tab`} className="button-secondary button-small">
              Import options
            </Link>
            <Link href="/gte" className="button-secondary button-small">
              Editors
            </Link>
          </div>

          <section>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Upload tab file</h1>
            <p className="mt-2 text-sm text-slate-600">
              Choose a common tab file. The imported tab will be added as a new track in this editor.
            </p>
          </section>

          <section className="grid gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Tab file</p>
                  <p className="mt-1 text-xs text-slate-500">{selectedFileName || "No file selected"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={TAB_IMPORT_ACCEPT}
                    className="hidden"
                    onChange={(event) => void handleFileSelect(event.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="button-primary button-small"
                    disabled={busy}
                  >
                    Choose file
                  </button>
                  {selectedFileName && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFileName("");
                        setTabText("");
                        setNotice(null);
                        setError(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="button-secondary button-small"
                      disabled={busy}
                    >
                      Clear file
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">Recognized formats: {supportedFormatsText}.</p>
            </div>

            <label className="block text-sm font-medium text-slate-700">
              Track name
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm"
                maxLength={80}
              />
            </label>

            {notice && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}
            {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

            {tabText && (
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-800">Parsed tab preview</h2>
                <pre className="mt-3 max-h-[24rem] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-800">
                  {tabText}
                </pre>
              </section>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void handleImport()}
                className="button-primary button-small"
                disabled={busy || !tabText}
              >
                {busy ? "Importing..." : "Import file"}
              </button>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return {
      redirect: {
        destination: "/auth/login",
        permanent: false,
      },
    };
  }

  const rawEditorId = ctx.params?.editor_id;
  const editorId = typeof rawEditorId === "string" ? rawEditorId : "";
  if (!editorId || editorId.trim().toLowerCase() === "local") {
    return { notFound: true };
  }

  return {
    props: {
      editorId,
    },
  };
};
