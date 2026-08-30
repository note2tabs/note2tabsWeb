import { useRouter } from "next/router";
import { useEffect } from "react";
import { normalizeAffiliateCode } from "../lib/affiliate";

export default function AffiliateAttributionCapture() {
  const router = useRouter();
  useEffect(() => {
    if (!router.isReady) return;
    const code = normalizeAffiliateCode(router.query.ref);
    if (!code) return;
    void fetch("/api/affiliate/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      keepalive: true,
    });
  }, [router.isReady, router.query.ref]);
  return null;
}
