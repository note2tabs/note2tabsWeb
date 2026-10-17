import { track } from "../analyticsV2";
import { createContext, useContext } from "react";
import type { EngagementArm } from "./experimentConfig";
export type PromptTicket = { contactId: string | null };
export const EngagementExperimentContext = createContext({
  arm: null as EngagementArm | null,
  allowLegacy: true,
  claimLegacy: async (): Promise<PromptTicket | null> => ({ contactId: null }),
});
export const useEngagementExperiment = () => useContext(EngagementExperimentContext);
export const ENGAGEMENT_PLAYBACK_EVENT = "note2tabs:engagement-playback-pause";
export function announceEngagementPlayback(editorId: string) {
  void track("gte_playback_paused", { editor_id: editorId });
  window.dispatchEvent(new CustomEvent(ENGAGEMENT_PLAYBACK_EVENT, { detail: { editorId } }));
}
export function acknowledgeEngagementContact(contactId: string | null) {
  if (!contactId) return;
  void fetch("/api/engagement/experiment", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "visible", contactId }) }).catch(() => {});
}

export const ENGAGEMENT_PLAYBACK_ACTIVE_EVENT = "note2tabs:engagement-playback-active";
