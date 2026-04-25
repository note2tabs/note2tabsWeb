import type { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { prisma } from "../../lib/prisma";
import { parseStoredTabPayload } from "../../lib/storedTabs";

type Props = Record<string, never>;

export default function SavedTabRedirectPage(_: Props) {
  return null;
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
  const appendEditorId = Array.isArray(ctx.query.appendEditorId)
    ? ctx.query.appendEditorId[0]
    : ctx.query.appendEditorId;
  const tabJob = await prisma.tabJob.findFirst({
    where: { id, userId: session.user.id },
    select: { resultJson: true },
  });

  if (!tabJob) {
    return { notFound: true };
  }

  const parsed = parseStoredTabPayload(tabJob.resultJson);
  const destination = parsed.backendJobId
    ? typeof appendEditorId === "string" && appendEditorId.trim()
      ? `/job/${encodeURIComponent(parsed.backendJobId)}?review=1&appendEditorId=${encodeURIComponent(appendEditorId)}`
      : `/job/${encodeURIComponent(parsed.backendJobId)}?review=1`
    : "/tabs";

  return {
    redirect: {
      destination,
      permanent: false,
    },
  };
};
