import { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";

export default function ModDashboardRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  const role = session?.user?.role || "";
  if (!session?.user?.id || (role !== "ADMIN" && role !== "MODERATOR" && role !== "MOD")) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  return {
    redirect: {
      destination: "/admin/analytics?view=moderation&range=30d",
      permanent: false,
    },
  };
};
