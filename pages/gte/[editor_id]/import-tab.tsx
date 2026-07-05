import { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../api/auth/[...nextauth]";

export default function ImportTabRedirectPage() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
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
    redirect: {
      destination: `/gte/${editorId}/import-text`,
      permanent: false,
    },
  };
};
