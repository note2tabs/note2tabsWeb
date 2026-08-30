import { useEffect } from "react";
import { useSession } from "next-auth/react";

const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;

export default function UserActivityTracker() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;

    const recordActivity = () => {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/account/activity", {
        method: "POST",
        keepalive: true,
      }).catch(() => {
        // Activity tracking must never interrupt the product experience.
      });
    };

    const recordActivityWhenVisible = () => {
      if (document.visibilityState === "visible") recordActivity();
    };

    recordActivity();
    const interval = window.setInterval(recordActivity, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", recordActivityWhenVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", recordActivityWhenVisible);
    };
  }, [session?.user?.id, status]);

  return null;
}
