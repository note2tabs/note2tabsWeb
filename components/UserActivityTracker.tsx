import { useEffect } from "react";
import { useSession } from "next-auth/react";

const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;
const LAST_ACTIVITY_KEY_PREFIX = "note2tabs:v1:last-activity:";

export function shouldRecordUserActivity(userId: string, now = Date.now()) {
  try {
    const key = `${LAST_ACTIVITY_KEY_PREFIX}${userId}`;
    const previous = Number(window.localStorage.getItem(key));
    if (Number.isFinite(previous) && now - previous < HEARTBEAT_INTERVAL_MS) return false;
    // Claim the interval before starting the request so concurrent tabs do not
    // all send the same heartbeat. A failed request clears this claim below.
    window.localStorage.setItem(key, String(now));
    return true;
  } catch {
    return true;
  }
}

function clearUserActivityClaim(userId: string, claimedAt: number) {
  try {
    const key = `${LAST_ACTIVITY_KEY_PREFIX}${userId}`;
    if (window.localStorage.getItem(key) === String(claimedAt)) window.localStorage.removeItem(key);
  } catch {
    // Storage is optional; the server still applies its stale-write guard.
  }
}

export default function UserActivityTracker() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;
    const userId = session.user.id;

    const recordActivity = () => {
      if (document.visibilityState !== "visible") return;
      const claimedAt = Date.now();
      if (!shouldRecordUserActivity(userId, claimedAt)) return;
      void fetch("/api/account/activity", {
        method: "POST",
        keepalive: true,
      }).then((response) => {
        if (!response.ok) clearUserActivityClaim(userId, claimedAt);
      }).catch(() => clearUserActivityClaim(userId, claimedAt));
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
