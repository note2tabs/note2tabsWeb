import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";

type LoadingPhase = "idle" | "loading" | "completing";

const SHOW_DELAY_MS = 140;
const COMPLETE_DURATION_MS = 220;

export default function RouteLoadingIndicator() {
  const router = useRouter();
  const [phase, setPhase] = useState<LoadingPhase>("idle");
  const phaseRef = useRef<LoadingPhase>("idle");
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const clearShowTimer = () => {
      if (!showTimerRef.current) return;
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    };
    const clearCompleteTimer = () => {
      if (!completeTimerRef.current) return;
      clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    };
    const start = (_url: string, options: { shallow: boolean }) => {
      if (options.shallow) return;
      clearShowTimer();
      clearCompleteTimer();
      setPhase("idle");
      phaseRef.current = "idle";
      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = null;
        phaseRef.current = "loading";
        setPhase("loading");
      }, SHOW_DELAY_MS);
    };
    const finish = () => {
      clearShowTimer();
      if (phaseRef.current === "idle") return;
      phaseRef.current = "completing";
      setPhase("completing");
      clearCompleteTimer();
      completeTimerRef.current = setTimeout(() => {
        completeTimerRef.current = null;
        phaseRef.current = "idle";
        setPhase("idle");
      }, COMPLETE_DURATION_MS);
    };

    router.events.on("routeChangeStart", start);
    router.events.on("routeChangeComplete", finish);
    router.events.on("routeChangeError", finish);
    return () => {
      clearShowTimer();
      clearCompleteTimer();
      router.events.off("routeChangeStart", start);
      router.events.off("routeChangeComplete", finish);
      router.events.off("routeChangeError", finish);
    };
  }, [router.events]);

  if (phase === "idle") return null;

  return (
    <div
      className={`route-loading-indicator route-loading-indicator--${phase}`}
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <span className="route-loading-indicator__bar" aria-hidden="true" />
    </div>
  );
}
