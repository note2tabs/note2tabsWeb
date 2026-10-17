import { describe, it, expect } from "vitest";
import { buildEngagementSnapshot as snapshot, evaluateEngagement as decide, DAY, type EngagementEvent, type DecisionContext } from "../../../lib/engagement/policy";
const now = Date.UTC(2026, 9, 10);
const e = (name: string, ago = DAY, extra: Partial<EngagementEvent> = {}): EngagementEvent => ({ id: `${name}:${ago}`, name, at: now - ago, ...extra });
const ctx = (extra: Partial<DecisionContext> = {}): DecisionContext => ({ channel: "premium", paid: false, marketingPermission: true, emailVerified: true, suppressed: false, safeMoment: true, accessibleSavedWork: true, ...extra });
const value = [e("transcription_succeeded", 3 * DAY, { job: "a" }), e("transcription_imported_to_editor", 3 * DAY - 1, { job: "a", project: "p" }), e("gte_editor_action", 3 * DAY - 2, { project: "p", action: "add_note" })];
describe("point-in-time engagement decisions", () => {
  it("ignores events at/after the checkpoint and duplicate delivery", () => {
    const s = snapshot([...value, value[0], e("subscription_started", 0), e("transcription_succeeded", -DAY)], now);
    expect(s.successes).toBe(1); expect(s.subscribed).toBe(false);
  });
  it("does not use foreground dwell, pricing alone, views or raw imports as satisfaction", () => {
    const s = snapshot([e("gte_session_ended"), e("pricing_viewed"), e("gte_editor_imported"), e("gte_editor_action", DAY, { action: "view" })], now);
    expect(s.valueTypes).toEqual([]); expect(decide(s, ctx()).eligible).toBe(false);
  });
  it("deduplicates retry events by business identity", () => {
    expect(snapshot([e("transcription_succeeded", DAY, { id: "1", job: "j" }), e("transcription_succeeded", DAY - 1, { id: "2", job: "j" })], now).successes).toBe(1);
  });
  it("requires repeat value and recent intent for optional premium", () => {
    const events = [...value, e("pricing_viewed", DAY)];
    expect(decide(snapshot(events, now), ctx()).eligible).toBe(false);
    const d = decide(snapshot([...events, e("gte_practice_started", DAY)], now), ctx());
    expect(d.action).toBe("premium_repeated_value");
  });
  it("does not reinforce prompt-driven or expired pricing visits", () => {
    const s = snapshot([...value, e("gte_practice_started"), e("pricing_viewed", DAY, { source: "premium_prompt" }), e("pricing_viewed", 8 * DAY)], now);
    expect(s.pricingDays).toBe(0); expect(decide(s, ctx()).eligible).toBe(false);
  });
  it("recognizes real plan limits but not invalid uploads", () => {
    expect(decide(snapshot([...value, e("transcription_submission_blocked", 1, { reason: "credits_exhausted" })], now), ctx()).action).toBe("premium_relevant_limit");
    expect(snapshot([...value, e("transcription_submission_blocked", 1, { reason: "missing_file" })], now).limitNeed).toBe(false);
  });
  it("honors paid status, unknown entitlement, unsafe moments and incomplete history", () => {
    const s = snapshot([...value, e("transcription_submission_blocked", 1, { reason: "credits_exhausted" })], now);
    for (const c of [ctx({ paid: true }), ctx({ paid: null }), ctx({ safeMoment: false }), ctx({ suppressed: true })]) expect(decide(s, c).eligible).toBe(false);
    expect(decide({ ...s, complete: false }, ctx()).eligible).toBe(false);
  });
  it("prioritizes unresolved failure; requires matching recovery", () => {
    const failed = [...value, e("transcription_failed", 1000, { job: "broken" }), e("transcription_succeeded", 500, { job: "other" })];
    expect(decide(snapshot(failed, now), ctx()).action).toBe("help_recover");
    expect(snapshot([...failed, e("transcription_succeeded", 1, { job: "broken" })], now).unresolvedFailure).toBe(false);
  });
  it("honors cross-surface dismissals and checkout suppression", () => {
    const needs = [...value, e("pricing_viewed"), e("gte_practice_started")];
    expect(decide(snapshot([...needs, e("premium_prompt_dismissed", DAY)], now), ctx()).reasons).toContain("dismissal_cooldown");
    expect(decide(snapshot([...needs, e("checkout_started", 1000)], now), ctx()).reasons).toContain("checkout_in_progress");
  });
  it("selects email type from observed value and rejects stale/inaccessible work", () => {
    expect(decide(snapshot([...value, e("gte_practice_started", 3 * DAY)], now), ctx({ channel: "email" })).action).toBe("email_resume_practice");
    expect(decide(snapshot([e("gte_file_import_completed", 3 * DAY, { project: "p" })], now), ctx({ channel: "email" })).action).toBe("email_resume_import");
    expect(decide(snapshot([e("gte_export_download_initiated", 3 * DAY, { project: "p" })], now), ctx({ channel: "email" })).action).toBe("email_resume_export_work");
    expect(decide(snapshot([e("gte_file_import_completed", 3 * DAY)], now), ctx({ channel: "email", accessibleSavedWork: false })).eligible).toBe(false);
    expect(decide(snapshot(value.map(x => ({ ...x, at: now - 15 * DAY })), now), ctx({ channel: "email" })).eligible).toBe(false);
  });
  it("does not email active, unsubscribed, unverified or unpermitted users", () => {
    for (const extra of [{ marketingPermission: false }, { emailVerified: false }]) expect(decide(snapshot(value, now), ctx({ channel: "email", ...extra })).eligible).toBe(false);
    for (const event of [e("gte_session_started", 1000), e("reminder_email_unsubscribed"), e("tab_return_reminder_sent")]) expect(decide(snapshot([...value, event], now), ctx({ channel: "email" })).eligible).toBe(false);
  });
});
