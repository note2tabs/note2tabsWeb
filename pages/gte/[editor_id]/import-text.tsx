import { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { useRouter } from "next/router";
import { useState } from "react";
import NoIndexHead from "../../../components/NoIndexHead";
import { gteApi } from "../../../lib/gteApi";
import { authOptions } from "../../api/auth/[...nextauth]";

type Props = {
  editorId: string;
};

const EXAMPLE_TAB = `e|----------------|----------------|
B|------1---------|------1---------|
G|----0---0-------|----0---0-------|
D|--2-------2-----|--2-------2-----|
A|3-----------3---|3-----------3---|
E|----------------|----------------|`;

export default function ImportTextTabPage({ editorId }: Props) {
  const router = useRouter();
  const [name, setName] = useState("Imported text tab");
  const [tabText, setTabText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    const text = tabText.trim();
    if (!text) {
      setError("Paste a text tab before importing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await gteApi.importAsciiTab(editorId, {
        text,
        name: name.trim() || "Imported text tab",
      });
      await router.push(`/gte/${editorId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not import text tab.";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <NoIndexHead title="Import text tab | Note2Tabs" canonicalPath={`/gte/${editorId}/import-text`} />
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
            <Link href="/gte" className="button-secondary button-small">
              Editors
            </Link>
          </div>

          <section>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Paste text tab</h1>
            <p className="mt-2 text-sm text-slate-600">
              Paste a six-string ASCII guitar tab. The imported tab will be added as a new track in this editor.
            </p>
          </section>

          <section className="grid gap-4">
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

            {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

            <label className="block text-sm font-medium text-slate-700">
              Text tab
              <textarea
                value={tabText}
                onChange={(event) => setTabText(event.target.value)}
                className="mt-2 min-h-[28rem] w-full resize-y rounded-lg border border-slate-200 bg-white p-3 font-mono text-sm leading-6 text-slate-800 shadow-sm"
                placeholder={EXAMPLE_TAB}
                spellCheck={false}
              />
            </label>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setTabText("");
                  setError(null);
                }}
                className="button-secondary button-small"
                disabled={busy || !tabText}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => void handleImport()}
                className="button-primary button-small"
                disabled={busy}
              >
                {busy ? "Importing..." : "Import text tab"}
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
