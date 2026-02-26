import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { generateFingerprint } from "../lib/fingerprint";

const STORAGE_PREFIX = "analytics_identity_linked:";

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export default function AnalyticsIdentityLinker() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    const userId = session?.user?.id;
    if (!userId || typeof window === "undefined") return;

    const storageKey = `${STORAGE_PREFIX}${userId}`;
    const alreadyLinked = window.localStorage.getItem(storageKey);
    if (alreadyLinked) return;

    const consent = getCookie("analytics_consent");
    if (consent === "denied") {
      window.localStorage.setItem(storageKey, new Date().toISOString());
      return;
    }

    void (async () => {
      try {
        let fingerprintId: string | undefined;
        try {
          const result = await generateFingerprint();
          fingerprintId = result.fingerprintId;
        } catch {
          // best effort
        }

        const anonId = getCookie("analytics_anon");
        const sessionId = getCookie("analytics_session");

        await fetch("/api/analytics/link-identity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "login",
            fingerprintId,
            anonId,
            sessionId,
          }),
        });
      } catch {
        // ignore linking errors on client
      } finally {
        window.localStorage.setItem(storageKey, new Date().toISOString());
      }
    })();
  }, [session?.user?.id, status]);

  return null;
}
