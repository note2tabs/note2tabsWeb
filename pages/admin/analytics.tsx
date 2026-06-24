import type { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import NoIndexHead from "../../components/NoIndexHead";
import { authOptions } from "../api/auth/[...nextauth]";

type Props = {
  dashboardUrl: string | null;
};

export default function AnalyticsDashboard({ dashboardUrl }: Props) {
  return (
    <>
      <NoIndexHead title="Analytics - Note2Tabs" canonicalPath="/admin/analytics" />
      <main className="page">
        <div className="container stack">
          <h1>Analytics moved to PostHog</h1>
          <p>
            Web analytics events, funnels, retention, paths, and user activity are
            now stored and analyzed in PostHog instead of the application database.
          </p>
          {dashboardUrl ? (
            <a
              className="button-primary"
              href={dashboardUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open PostHog dashboard
            </a>
          ) : (
            <p>
              Set <code>POSTHOG_DASHBOARD_URL</code> in the server environment to
              add a direct dashboard link here.
            </p>
          )}
          <Link href="/">Back to Note2Tabs</Link>
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  return {
    props: {
      dashboardUrl: process.env.POSTHOG_DASHBOARD_URL || null,
    },
  };
};

