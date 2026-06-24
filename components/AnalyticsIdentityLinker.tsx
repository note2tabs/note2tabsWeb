import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { getPostHog } from "../lib/posthogClient";

export default function AnalyticsIdentityLinker() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;

    const posthog = getPostHog();
    if (status === "authenticated" && session?.user?.id) {
      posthog.identify(session.user.id, {
        email: session.user.email || undefined,
        name: session.user.name || undefined,
      });
    }
  }, [session?.user?.email, session?.user?.id, session?.user?.name, status]);

  return null;
}
