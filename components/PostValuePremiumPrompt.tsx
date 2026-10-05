import { useEffect, useRef } from "react";
import { ANALYTICS_EVENTS, sendEvent } from "../lib/analytics";

type PostValuePremiumPromptProps = {
  open: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  editorId: string;
  trigger: "playback_completed" | "practice_started";
};

export default function PostValuePremiumPrompt({
  open,
  onClose,
  onUpgrade,
  editorId,
  trigger,
}: PostValuePremiumPromptProps) {
  const promptRef = useRef<HTMLElement | null>(null);
  const viewedRef = useRef(false);

  useEffect(() => {
    if (!open) viewedRef.current = false;
  }, [open]);

  useEffect(() => {
    const element = promptRef.current;
    if (!open || !element || viewedRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || entry.intersectionRatio < 0.5 || viewedRef.current) return;
      viewedRef.current = true;
      sendEvent(ANALYTICS_EVENTS.premiumPromptViewed, {
        reason: "post_value_interaction",
        trigger,
        placement: "editor_nonmodal",
        surface: "editor",
        editor_id: editorId,
      });
      observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [editorId, open, trigger]);

  if (!open) return null;
  return (
    <aside ref={promptRef} className="heavy-preview-editor-prompt post-value-premium-prompt" aria-label="Premium plans">
      <button type="button" className="heavy-preview-editor-prompt__close" onClick={onClose} aria-label="Dismiss Premium offer">×</button>
      <div className="heavy-preview-editor-prompt__copy">
        <strong>Get more from your transcriptions</strong>
        <p>Use the Heavy model, transcribe larger files, and get 100 monthly credits.</p>
      </div>
      <div className="heavy-preview-editor-prompt__actions">
        <button type="button" className="button-primary button-small" onClick={onUpgrade}>See plans</button>
        <button type="button" className="heavy-preview-editor-prompt__later" onClick={onClose}>Not now</button>
      </div>
      <small className="heavy-preview-editor-prompt__reassurance">Plans from $5.99/month · Cancel anytime</small>
    </aside>
  );
}
