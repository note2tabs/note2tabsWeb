/** Pure, point-in-time rules. No fitted model, side effects, or incentives. */
export const ENGAGEMENT_POLICY_VERSION = "engagement_rules_v1";
export const DAY = 86_400_000;
export type EngagementEvent = {
  id: string;
  at: number;
  name: string;
  project?: string;
  job?: string;
  session?: string;
  source?: string;
  reason?: string;
  action?: string;
  contentLocale?: string;
};
export const ENGAGEMENT_EVENTS = new Set([
  "signup_completed", "login_succeeded", "product_home_viewed", "gte_session_started",
  "transcription_started", "transcription_succeeded", "transcription_failed",
  "transcription_imported_to_editor", "gte_editor_imported", "gte_file_import_completed",
  "gte_editor_action", "gte_editor_saved", "gte_practice_started", "gte_playback_completed", "gte_playback_paused",
  "gte_export_download_initiated", "gte_export_failed", "gte_file_import_failed",
  "pricing_viewed", "pricing_billing_selected", "transcription_submission_blocked",
  "checkout_started", "checkout_failed", "checkout_client_failed", "checkout_cancelled",
  "subscription_started", "subscription_ended", "premium_prompt_viewed", "premium_prompt_dismissed",
  "inactive_signup_reminder_sent", "tab_return_reminder_sent", "reminder_email_unsubscribed",
]);
const VALUE_EVENTS = new Set([
  "transcription_imported_to_editor", "gte_file_import_completed", "gte_editor_action",
  "gte_editor_saved", "gte_practice_started", "gte_playback_completed", "gte_playback_paused", "gte_export_download_initiated",
]);
const ACTIVITY_EVENTS = new Set([
  ...VALUE_EVENTS, "gte_editor_imported", "transcription_started", "transcription_succeeded",
  "gte_session_started", "product_home_viewed", "login_succeeded",
]);
export function isMeaningfulActivity(name: string) { return ACTIVITY_EVENTS.has(name); }

export type EngagementSnapshot = {
  at: number;
  windowStart: number;
  complete: boolean;
  successes: number;
  attempts: number;
  imports: number;
  exports: number;
  edits: number;
  practices: number;
  saved: number;
  meaningfulDays: number;
  meaningfulSessions: number;
  pricingDays: number;
  billingIntent: boolean;
  limitNeed: boolean;
  unresolvedFailure: boolean;
  checkoutActive: boolean;
  subscribed: boolean;
  unsubscribed: boolean;
  lastActivityAt: number | null;
  lastEmailAt: number | null;
  lastPromptAt: number | null;
  lastDismissedAt: number | null;
  lastValueAt: number | null;
  valueTypes: Array<"transcription" | "import" | "export" | "practice" | "editing">;
  evidence: string[];
};

export function buildEngagementSnapshot(input: EngagementEvent[], at: number, complete = true): EngagementSnapshot {
  if (!Number.isFinite(at)) throw new Error("Invalid decision time");
  const start = at - 30 * DAY;
  // Strictly before the checkpoint: the outcome itself can never qualify a rule.
  const events = [...new Map(input.filter(e => Number.isFinite(e.at) && e.at >= start && e.at < at)
    .map(e => [e.id, e])).values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const named = (name: string) => events.filter(e => e.name === name);
  const distinct = (names: string[], key: "project" | "job") => {
    const selected = events.filter(e => names.includes(e.name));
    // Unknown business identity: do not claim duplicate event rows are separate jobs/projects.
    return new Set(selected.map(e => e[key] || `unknown:${Math.floor(e.at / DAY)}`)).size;
  };
  const latest = (names: string[]) => events.filter(e => names.includes(e.name)).at(-1)?.at ?? null;
  const activity = events.filter(e => ACTIVITY_EVENTS.has(e.name));
  const successes = distinct(["transcription_succeeded"], "job");
  const imports = distinct(["gte_file_import_completed"], "project");
  const exports = distinct(["gte_export_download_initiated"], "project");
  const edits = new Set(named("gte_editor_action").filter(e => e.action && !/^(view|select|open)/.test(e.action))
    .map(e => `${e.project || "unknown"}:${Math.floor(e.at / DAY)}`)).size;
  const practices = new Set(named("gte_practice_started").map(e => e.session || `${e.project}:${Math.floor(e.at / DAY)}`)).size;
  const saved = distinct(["gte_editor_saved"], "project");
  const firstSuccess = named("transcription_succeeded")[0]?.at;
  const usedTranscription = successes > 0 && events.some(e => VALUE_EVENTS.has(e.name) && e.at >= (firstSuccess ?? Infinity));
  const valueTypes: EngagementSnapshot["valueTypes"] = [];
  if (usedTranscription) valueTypes.push("transcription");
  if (imports) valueTypes.push("import");
  if (exports) valueTypes.push("export");
  if (practices && (successes || imports || edits || saved)) valueTypes.push("practice");
  if (edits || saved) valueTypes.push("editing");
  const failures = events.filter(e => e.at >= at - DAY && ["transcription_failed", "gte_export_failed", "gte_file_import_failed", "checkout_failed", "checkout_client_failed"].includes(e.name));
  const recovered = (lastFailure: EngagementEvent) => events.some(e => e.at > lastFailure.at && (
    lastFailure.name.startsWith("checkout") ? e.name === "subscription_started" || e.name === "checkout_cancelled" :
    lastFailure.name === "transcription_failed" ? e.name === "transcription_succeeded" && Boolean(e.job && e.job === lastFailure.job) :
    lastFailure.name === "gte_export_failed" ? e.name === "gte_export_download_initiated" && Boolean(e.project && e.project === lastFailure.project) :
    e.name === "gte_file_import_completed" && Boolean(e.project && e.project === lastFailure.project)
  ));
  const pricing = named("pricing_viewed").filter(e => e.at >= at - 7 * DAY && !/prompt|upsell|reminder|upgrade/.test(`${e.source || ""} ${e.reason || ""}`));
  const lastCheckout = latest(["checkout_started"]);
  const checkoutEnd = latest(["subscription_started", "checkout_cancelled", "checkout_failed", "checkout_client_failed"]);
  const sub = events.filter(e => ["subscription_started", "subscription_ended"].includes(e.name)).at(-1);
  return {
    at, windowStart: start, complete, successes, attempts: distinct(["transcription_started"], "job"),
    imports, exports, edits, practices, saved,
    meaningfulDays: new Set(activity.map(e => Math.floor(e.at / DAY))).size,
    meaningfulSessions: new Set(activity.filter(e => e.session).map(e => e.session)).size,
    pricingDays: new Set(pricing.map(e => Math.floor(e.at / DAY))).size,
    billingIntent: named("pricing_billing_selected").some(e => e.at >= at - 7 * DAY),
    limitNeed: named("transcription_submission_blocked").some(e => e.at >= at - DAY && ["credits_exhausted", "clip_duration_limit", "file_too_large"].includes(e.reason || "")),
    unresolvedFailure: failures.some(f => !recovered(f)),
    checkoutActive: lastCheckout !== null && at - lastCheckout < 2 * 3_600_000 && (checkoutEnd === null || checkoutEnd < lastCheckout),
    subscribed: sub?.name === "subscription_started", unsubscribed: named("reminder_email_unsubscribed").length > 0,
    lastActivityAt: activity.at(-1)?.at ?? null,
    lastEmailAt: latest(["inactive_signup_reminder_sent", "tab_return_reminder_sent"]),
    lastPromptAt: latest(["premium_prompt_viewed"]), lastDismissedAt: latest(["premium_prompt_dismissed"]),
    lastValueAt: events.filter(e => VALUE_EVENTS.has(e.name)).at(-1)?.at ?? null,
    valueTypes, evidence: valueTypes.map(type => `value:${type}`),
  };
}

export type DecisionContext = {
  channel: "email" | "premium";
  // Entitlement and permission are supplied by the server, never inferred from client events.
  paid: boolean | null;
  marketingPermission: boolean;
  emailVerified: boolean;
  suppressed: boolean;
  safeMoment: boolean;
  accessibleSavedWork: boolean;
};
export type EngagementDecision = {
  version: typeof ENGAGEMENT_POLICY_VERSION;
  action: "none" | "help_recover" | "premium_repeated_value" | "premium_relevant_limit" |
    "email_resume_export_work" | "email_resume_practice" | "email_resume_import" | "email_try_another_transcription" | "email_resume_editing";
  eligible: boolean;
  reasons: string[];
  valueTypes: EngagementSnapshot["valueTypes"];
};
export function evaluateEngagement(s: EngagementSnapshot, c: DecisionContext): EngagementDecision {
  const result = (action: EngagementDecision["action"], ...reasons: string[]): EngagementDecision => ({
    version: ENGAGEMENT_POLICY_VERSION, action, eligible: action !== "none" && action !== "help_recover", reasons, valueTypes: s.valueTypes,
  });
  if (!s.complete) return result("none", "incomplete_history");
  if (c.suppressed) return result("none", "suppressed");
  if (c.paid === null) return result("none", "unknown_entitlement");
  if (s.checkoutActive) return result("none", "checkout_in_progress");
  if (s.unresolvedFailure) return result("help_recover", "unresolved_failure");
  if (!s.valueTypes.length) return result("none", "no_observed_value");
  if (c.channel === "premium") {
    if (c.paid || s.subscribed) return result("none", "already_paid");
    if (!c.safeMoment) return result("none", "unsafe_task_moment");
    if (s.lastDismissedAt !== null && s.at - s.lastDismissedAt < 7 * DAY) return result("none", "dismissal_cooldown");
    if (s.lastPromptAt !== null && s.at - s.lastPromptAt < DAY) return result("none", "impression_cooldown");
    if (s.limitNeed) return result("premium_relevant_limit", ...s.evidence, "actual_limit");
    if ((s.meaningfulDays >= 2 || s.successes >= 2 || s.exports >= 2) && (s.pricingDays || s.billingIntent))
      return result("premium_repeated_value", ...s.evidence, "repeat_use", "recent_pricing_intent");
    return result("none", "insufficient_repeat_value_or_intent");
  }
  if (!c.marketingPermission || !c.emailVerified || s.unsubscribed) return result("none", "email_not_permitted");
  if (s.lastEmailAt !== null && s.at - s.lastEmailAt < 7 * DAY) return result("none", "contact_cooldown");
  const inactive = s.lastActivityAt === null ? Infinity : s.at - s.lastActivityAt;
  if (inactive < 2 * DAY) return result("none", "recently_active");
  if (inactive > 14 * DAY) return result("none", "outside_return_window");
  if (c.accessibleSavedWork) {
    if (s.valueTypes.includes("practice")) return result("email_resume_practice", ...s.evidence);
    if (s.exports) return result("email_resume_export_work", ...s.evidence);
    if (s.imports) return result("email_resume_import", ...s.evidence);
    return result("email_resume_editing", ...s.evidence);
  }
  if (s.valueTypes.includes("transcription")) return result("email_try_another_transcription", ...s.evidence);
  return result("none", "no_accessible_return_context");
}
