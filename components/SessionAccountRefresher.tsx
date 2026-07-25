import { useEffect } from "react";
import { useSession } from "next-auth/react";

const ACCOUNT_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ACCOUNT_REFRESH_LEASE_MS = 5 * 60 * 1000;
const ACCOUNT_REFRESH_LEASE_PREFIX = "note2tabs:account-refresh:";

export default function SessionAccountRefresher() {
  const { data: session, status, update } = useSession();
  const userId = session?.user?.id;
  const accountSyncedAt = session?.user?.accountSyncedAt || 0;

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    const now = Date.now();
    if (now - accountSyncedAt < ACCOUNT_REFRESH_INTERVAL_MS) return;

    const leaseKey = `${ACCOUNT_REFRESH_LEASE_PREFIX}${userId}`;
    try {
      const lastAttempt = Number(window.localStorage.getItem(leaseKey) || 0);
      if (Number.isFinite(lastAttempt) && now - lastAttempt < ACCOUNT_REFRESH_LEASE_MS) {
        return;
      }
      window.localStorage.setItem(leaseKey, String(now));
    } catch {
      // Storage is only a cross-tab optimization; session refresh still works without it.
    }

    void update().catch(() => null);
  }, [accountSyncedAt, status, update, userId]);

  return null;
}
