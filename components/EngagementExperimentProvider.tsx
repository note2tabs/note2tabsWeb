import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useLocaleRouter } from "../lib/i18n/react";
import { EngagementExperimentContext, ENGAGEMENT_PLAYBACK_EVENT, ENGAGEMENT_PLAYBACK_ACTIVE_EVENT, type PromptTicket } from "../lib/engagement/react";
import { ENGAGEMENT_CTA_DELAY_MS, type EngagementArm } from "../lib/engagement/experimentConfig";
import { track, flush } from "../lib/analyticsV2";
import { flushGteTelemetry } from "../lib/gteTelemetryClient";
import { PremiumPromptCard } from "./PremiumUpgradePrompt";

type State = { mode: string; arm?: EngagementArm };
async function requestExperiment(body: Record<string, unknown>) {
  const response = await fetch("/api/engagement/experiment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Experiment unavailable");
  return response.json();
}
export default function EngagementExperimentProvider({ children, request = requestExperiment }: { children: ReactNode; request?: (body: Record<string, unknown>) => Promise<any> }) {
  const enabled = process.env.NEXT_PUBLIC_ENGAGEMENT_EXPERIMENT_ENABLED === "true";
  const { data: session, status } = useSession();
  const router = useLocaleRouter();
  const [state, setState] = useState<State>({ mode: enabled ? "loading" : "disabled" });
  const [prompt, setPrompt] = useState<{ id: string; path: string } | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    setPrompt(null);
    if (!enabled || status === "unauthenticated") { setState({ mode: "disabled" }); return; }
    if (status !== "authenticated") return;
    let active = true;
    setState({ mode: "loading" });
    void request({ operation: "enroll" }).then(result => { if (active) setState(result); })
      .catch(() => { if (active) setState({ mode: "unavailable" }); });
    return () => { active = false; };
  }, [enabled, session?.user?.id, status, request]);
  const allowLegacy = ["disabled", "excluded"].includes(state.mode) || state.mode === "active" && state.arm === "existing";
  const claimLegacy = useCallback(async (): Promise<PromptTicket | null> => {
    if (["disabled", "excluded"].includes(state.mode)) return { contactId: null };
    if (state.arm !== "existing") return null;
    try {
      const r = await request({ operation: "claim", checkpoint: "legacy", safeMoment: true });
      return r.show ? { contactId: r.contactId } : null;
    } catch { return null; }
  }, [state, request]);
  useEffect(() => {
    if (state.mode !== "active" || state.arm !== "contextual") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => { generation.current++; if (timer) clearTimeout(timer); };
    const onPause = (event: Event) => {
      cancel();
      const editorId = (event as CustomEvent).detail?.editorId;
      if (typeof editorId !== "string") return;
      const token = generation.current, path = window.location.pathname;
      timer = setTimeout(async () => {
        if (document.visibilityState !== "visible" || document.activeElement?.matches("input,textarea,[contenteditable=true]")) return;
        try {
          await Promise.all([flush(), flushGteTelemetry()]);
          if (token !== generation.current || path !== window.location.pathname || document.visibilityState !== "visible") return;
          const r = await request({ operation: "claim", checkpoint: "playback_pause", safeMoment: true });
          if (!r.show) return;
          if (token !== generation.current || path !== window.location.pathname || document.visibilityState !== "visible") {
            void request({ operation: "cancelled", contactId: r.contactId }).catch(() => {}); return;
          }
          setPrompt({ id: r.contactId, path });
          void track("premium_prompt_rendered", { engagement_arm: "contextual", contact_id: r.contactId, surface: "contextual_experiment" });
        } catch { /* No promotion on failure; keep normal editor use working. */ }
      }, ENGAGEMENT_CTA_DELAY_MS);
    };
    const onPlay = () => { cancel(); setPrompt(null); };
    const onNavigate = () => { cancel(); setPrompt(null); };
    router.events.on("routeChangeStart", onNavigate);
    window.addEventListener(ENGAGEMENT_PLAYBACK_ACTIVE_EVENT, onPlay);
    window.addEventListener(ENGAGEMENT_PLAYBACK_EVENT, onPause);
    window.addEventListener("pointerdown", cancel);
    window.addEventListener("keydown", cancel);
    document.addEventListener("visibilitychange", cancel);
    return () => {
      cancel(); window.removeEventListener(ENGAGEMENT_PLAYBACK_EVENT, onPause);
      window.removeEventListener(ENGAGEMENT_PLAYBACK_ACTIVE_EVENT, onPlay);
      window.removeEventListener("pointerdown", cancel); window.removeEventListener("keydown", cancel);
      document.removeEventListener("visibilitychange", cancel);
      router.events.off("routeChangeStart", onNavigate);
    };
  }, [state, router.events, request]);
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!prompt || !element.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || entry.intersectionRatio < .5) return;
      void request({ operation: "visible", contactId: prompt.id }).catch(() => {});
      void track("premium_prompt_viewed", { engagement_arm: "contextual", contact_id: prompt.id, surface: "contextual_experiment" });
      observer.disconnect();
    }, { threshold: .5 });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [prompt, request]);
  return <EngagementExperimentContext.Provider value={{ arm: state.arm || null, allowLegacy, claimLegacy }}>
    {children}
    {prompt && prompt.path === router.asPath.split("?")[0] && <div ref={element}>
      <PremiumPromptCard reason="returning_user" href="/pricing?source=engagement_contextual" onDismiss={() => {
        void track("premium_prompt_dismissed", { contact_id: prompt.id, surface: "contextual_experiment" }); setPrompt(null);
      }} onClick={() => { void track("premium_prompt_clicked", { contact_id: prompt.id, surface: "contextual_experiment" }); }} />
    </div>}
  </EngagementExperimentContext.Provider>;
}
