import { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import EditorWorkspace from "../../components/EditorWorkspace";

type Props = {
  editorId: string;
};

export default function EditorPage({ editorId }: Props) {
  return (
    <>
      <Head>
        <title>Editor – Note2Tabs</title>
      </Head>
      <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold">Tab Editor</h1>
              <p className="text-sm text-slate-400">All edits are saved via the backend.</p>
            </div>
            <Link href="/account" className="text-sm text-blue-400 hover:text-blue-300">
              ← Back to account
            </Link>
          </div>
          <EditorWorkspace editorId={editorId} />
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id) {
    return {
      redirect: {
        destination: "/auth/login",
        permanent: false,
      },
    };
  }
  const editorId = ctx.params?.editor_id as string;
  return {
    props: {
      editorId,
    },
  };
};
