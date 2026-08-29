import { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { hasFreshUserRole } from "../../lib/serverAuth";

const MODERATION_ROLES = new Set(["ADMIN", "MODERATOR", "MOD"]);

export default function ModDashboardRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id) {
    return {
      redirect: {
        destination: `/auth/login?next=${encodeURIComponent(ctx.resolvedUrl || "/mod/dashboard")}`,
        permanent: false,
      },
    };
  }
  if (!(await hasFreshUserRole(session, MODERATION_ROLES))) {
    return { redirect: { destination: "/home", permanent: false } };
  }

  return {
    redirect: {
      destination: "/admin/analytics?view=moderation&range=30d",
      permanent: false,
    },
  };
};
