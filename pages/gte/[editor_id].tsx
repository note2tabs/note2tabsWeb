import type { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { prisma } from "../../lib/prisma";
import { withEditorLocale } from "../../lib/i18n/editor/request";
import { requestLocale } from "../../lib/i18n/request";
import { localeSwitchHref } from "../../lib/i18n/locale";
import { GTE_GUEST_EDITOR_ID } from "../../lib/gteGuestDraft";
export { default } from "../../components/GteEditorWorkspace";

export const getServerSideProps: GetServerSideProps = withEditorLocale(async (ctx) => {
  const editorId = `${ctx.params?.editor_id || ""}`;
  const normalizedEditorId = editorId.trim().toLowerCase();
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  const tutorialUser = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { passedTutorial: true },
      })
    : null;
  if (normalizedEditorId === GTE_GUEST_EDITOR_ID) {
    return {
      props: {
        editorId: GTE_GUEST_EDITOR_ID,
        isGuestMode: true,
        hasAccount: Boolean(session?.user?.id),
        passedTutorial: Boolean(tutorialUser?.passedTutorial),
      },
    };
  }

  if (!session?.user?.id) {
    return {
      redirect: {
        destination: localeSwitchHref(`/auth/login?next=${encodeURIComponent(ctx.resolvedUrl || `/gte/${editorId}`)}`, requestLocale({body: undefined, cookies: ctx.req.cookies})),
        permanent: false,
      },
    };
  }
  return {
    props: {
      editorId,
      isGuestMode: false,
      hasAccount: true,
      passedTutorial: Boolean(tutorialUser?.passedTutorial),
    },
  };
});
