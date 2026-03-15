import type { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../api/auth/[...nextauth]";

type Props = {
  error?: string;
};

export default function EditTabRedirect({ error }: Props) {
  if (error) {
    return (
      <main className="page">
        <div className="container stack">
          <h1 className="page-title">Could not open import page</h1>
          <p className="page-subtitle">{error}</p>
        </div>
      </main>
    );
  }
  return (
    <main className="page">
      <div className="container stack">
        <h1 className="page-title">Redirecting...</h1>
        <p className="page-subtitle">Opening your saved-tab import page.</p>
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id) {
    return {
      redirect: {
        destination: "/auth/login",
        permanent: false,
      },
    };
  }

  const id = ctx.params?.id as string;
  const appendEditorId = ctx.query.appendEditorId;
  const destination =
    typeof appendEditorId === "string" && appendEditorId.trim()
      ? `/tabs/${id}?appendEditorId=${encodeURIComponent(appendEditorId)}`
      : `/tabs/${id}`;

  return {
    redirect: {
      destination,
      permanent: false,
    },
  };
};
