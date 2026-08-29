export type SubscriptionRetentionGoal =
  | "transcribe_songs"
  | "higher_accuracy"
  | "edit_tabs"
  | "practice"
  | "save_export"
  | "explore"
  | "skip";

export const SUBSCRIPTION_RETENTION_GOALS: Array<{
  value: SubscriptionRetentionGoal;
  label: string;
}> = [
  { value: "transcribe_songs", label: "Turn full songs into editable tabs" },
  { value: "higher_accuracy", label: "Get the best transcription accuracy available" },
  { value: "edit_tabs", label: "Create and arrange tabs in the editor" },
  { value: "practice", label: "Practice songs and improve my playing" },
  { value: "save_export", label: "Save, refine, and export my music" },
  { value: "explore", label: "Explore what Note2Tabs can do" },
  { value: "skip", label: "Prefer not to say" },
];

export type SubscriptionValueReminder = {
  title: string;
  detail: string;
  href: string;
  action: string;
};

export function getSubscriptionValueReminder(
  goal: SubscriptionRetentionGoal | ""
): SubscriptionValueReminder | null {
  if (goal === "transcribe_songs") {
    return {
      title: "Premium gives full songs more room",
      detail: "Keep 100 monthly credits, rollover, full-length uploads, and greater Heavy-model capacity for the recordings you want to finish.",
      href: "/transcribe",
      action: "Transcribe a song",
    };
  }
  if (goal === "higher_accuracy") {
    return {
      title: "Keep access to more Heavy-model transcription",
      detail: "The Heavy model is Note2Tabs’ highest-accuracy option for complex recordings, and Premium gives you substantially more room to use it.",
      href: "/transcribe",
      action: "Try the Heavy model",
    };
  }
  if (goal === "edit_tabs") {
    return {
      title: "Your editor is ready when inspiration returns",
      detail: "Continue arranging notes, chords, drums, timing, and playback without starting over.",
      href: "/gte",
      action: "Open my editor",
    };
  }
  if (goal === "practice") {
    return {
      title: "Turn a saved tab into your next practice session",
      detail: "Return to your workspace and continue with playback, looping, speed training, and Practice mode.",
      href: "/home",
      action: "Continue practicing",
    };
  }
  if (goal === "save_export") {
    return {
      title: "Your saved work is still here",
      detail: "Reopen a recent tab to refine it, play it back, or export it in the format you need.",
      href: "/tabs",
      action: "View my saved tabs",
    };
  }
  if (goal === "explore") {
    return {
      title: "There may still be more worth trying",
      detail: "Your workspace brings transcription, editing, playback, and practice together in one place.",
      href: "/home",
      action: "Return to my workspace",
    };
  }
  return null;
}
