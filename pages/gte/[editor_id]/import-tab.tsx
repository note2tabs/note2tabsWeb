import { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import NoIndexHead from "../../../components/NoIndexHead";
import { authOptions } from "../../api/auth/[...nextauth]";

type Props = {
  editorId: string;
};

export default function ImportTabPage({ editorId }: Props) {
  return (
    <>
      <NoIndexHead title="Import tab | Note2Tabs" canonicalPath={`/gte/${editorId}/import-tab`} />
      <main className="content py-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/gte/${editorId}`} className="button-secondary button-small">
              Back to editor
            </Link>
            <Link href="/gte" className="button-secondary button-small">
              Editors
            </Link>
          </div>

          <section>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Import tab</h1>
            <p className="mt-2 text-sm text-slate-600">Choose how you want to bring a tab into this editor.</p>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <Link
              href={`/gte/${editorId}/import-file`}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
            >
              <h2 className="text-lg font-semibold text-slate-900">Upload tab file</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Import Guitar Pro, MusicXML, MIDI, or another supported tab file.
              </p>
              <span className="mt-4 inline-flex button-primary button-small">Choose file</span>
            </Link>

            <Link
              href={`/gte/${editorId}/import-text`}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
            >
              <h2 className="text-lg font-semibold text-slate-900">Paste text tab</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Paste a six-string ASCII guitar tab from a website, note, or plain text file.
              </p>
              <span className="mt-4 inline-flex button-secondary button-small">Paste text</span>
            </Link>
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
