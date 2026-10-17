// Node 22.18+ (native TS stripping). Raw pseudonymous history stays outside git.
// Usage: node scripts/engagement/backtest.mjs /path/history.json /path/report.json
import fs from "node:fs";
import { createHash } from "node:crypto";
import { buildEngagementSnapshot, evaluateEngagement, isMeaningfulActivity, DAY, ENGAGEMENT_POLICY_VERSION } from "../../lib/engagement/policy.ts";

export function replayHistory(users) {
  const end = Date.parse("2026-10-16T00:00:00Z");
  const cohortEnd = Date.parse("2026-10-08T00:00:00Z");
  const records = users.map(user => ({
    // Person ID is used only to dedupe input, never written to the report.
    person: user.person,
    events: user.events.map(([at, name, id, job, project, session, source, reason, action]) => ({
      at: Date.parse(at.replace(" ", "T") + (at.endsWith("Z") ? "" : "Z")),
      name, id, job: job || undefined, project: project || undefined, session: session || undefined,
      source: source || undefined, reason: reason || undefined, action: action || undefined,
    })).filter(e => Number.isFinite(e.at)).sort((a, b) => a.at - b.at),
  }));
  if (new Set(records.map(r => r.person)).size !== records.length) throw new Error("Duplicate people in input");
  const context = channel => ({ channel, paid: false, marketingPermission: true, emailVerified: true,
    suppressed: false, safeMoment: true, accessibleSavedWork: false });
  const wilson = (k, n) => {
    if (!n) return null;
    const z = 1.95996398454, p = k / n, den = 1 + z * z / n;
    const mid = (p + z * z / (2 * n)) / den;
    const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
    return [Math.max(0, mid - half), Math.min(1, mid + half)];
  };
  const stats = rows => {
    const flagged = rows.filter(r => r.flagged), positive = rows.filter(r => r.positive);
    const caught = flagged.filter(r => r.positive).length;
    return { people: rows.length, positive: positive.length, flagged: flagged.length, caught,
      missed: positive.length - caught, flaggedWithoutOutcome: flagged.length - caught,
      recall: positive.length ? caught / positive.length : null,
      precision: flagged.length ? caught / flagged.length : null,
      recall95: wilson(caught, positive.length), precision95: wilson(caught, flagged.length),
      flagRate: rows.length ? flagged.length / rows.length : null,
      baseRate: rows.length ? positive.length / rows.length : null };
  };
  const returnRows = [], premiumRows = [], emailRows = [], subscriberValueRows = [];
  const actionCounts = {};
  for (const { events } of records) {
    const signup = events.find(e => e.name === "signup_completed")?.at;
    const firstPaid = events.find(e => e.name === "subscription_started")?.at;
    // Re-evaluate only at actual observed events, never after the paid outcome.
    const premiumCheckpoints = [...new Set(events.filter(e => e.at < (firstPaid ?? end)).map(e => e.at + 1))];
    let premiumCaught = false;
    for (const at of premiumCheckpoints) {
      if (at >= (firstPaid ?? end)) continue;
      const d = evaluateEngagement(buildEngagementSnapshot(events, at), context("premium"));
      if (d.eligible) { premiumCaught = true; break; }
    }
    premiumRows.push({ flagged: premiumCaught, positive: firstPaid !== undefined });
    subscriberValueRows.push({ flagged: buildEngagementSnapshot(events, firstPaid ?? end).valueTypes.length > 0, positive: firstPaid !== undefined });
    if (signup === undefined || signup >= cohortEnd || firstPaid !== undefined && firstPaid < signup) continue;
    const firstReturn = events.find(e => e.at >= signup + DAY && e.at < signup + 7 * DAY && isMeaningfulActivity(e.name))?.at;
    const early = buildEngagementSnapshot(events, signup + 6 * 3_600_000);
    const date = new Date(signup).toISOString().slice(0, 10);
    returnRows.push({ flagged: early.valueTypes.length > 0, positive: firstReturn !== undefined, date, practices: early.practices, edits: early.edits, successes: early.successes, pricing: early.pricingDays });
    let emailCaught = false;
    // A reminder must have been eligible BEFORE the first return; a later
    // return cannot retroactively qualify its own reminder.
    for (let at = signup + 2 * DAY; at < Math.min(firstReturn ?? signup + 7 * DAY, end); at += 6 * 3_600_000) {
      const s = buildEngagementSnapshot(events, at);
      // Historical saved-work accessibility/permission is unavailable: this is
      // behavioral opportunity only, explicitly not a count of sendable email.
      const c = context("email"); c.accessibleSavedWork = s.saved > 0;
      const d = evaluateEngagement(s, c);
      if (d.eligible) { emailCaught = true; actionCounts[d.action] = (actionCounts[d.action] || 0) + 1; break; }
    }
    emailRows.push({ flagged: emailCaught, positive: firstReturn !== undefined, date });
  }
  return {
    version: ENGAGEMENT_POLICY_VERSION, observedUntilExclusive: "2026-10-16T00:00:00Z",
    rawPeople: records.length, rawEvents: records.reduce((n, r) => n + r.events.length, 0),
    earlyValueReturn: stats(returnRows), emailBeforeFirstReturn: stats(emailRows),
    premiumBeforeFirstTrackedSubscription: stats(premiumRows),
    valueObservedBeforeTrackedSubscription: stats(subscriberValueRows), emailActionCounts: actionCounts,
    signalComparisons: Object.fromEntries([
      ["practice_in_first_6h", r => r.practices > 0],
      ["deliberate_edit_in_first_6h", r => r.edits > 0],
      ["multiple_successes_in_first_6h", r => r.successes >= 2],
      ["pricing_in_first_6h", r => r.pricing > 0],
    ].map(([name, fn]) => [name, { early: stats(returnRows.filter(r => r.date < "2026-09-22").map(r => ({ ...r, flagged: fn(r) }))), later: stats(returnRows.filter(r => r.date >= "2026-09-22").map(r => ({ ...r, flagged: fn(r) }))) }])),
    returnPeriods: {
      early: stats(returnRows.filter(r => r.date < "2026-09-22")),
      later: stats(returnRows.filter(r => r.date >= "2026-09-22")),
    },
    limitations: [
      "Descriptive retrospective coverage, not incremental treatment effect or independent validation.",
      "First observed signup/purchase in Sep 1-Oct 15; no lifetime billing reconciliation.",
      "New client export and file-import signals absent historically; no imputation.",
      "Email permission, verification, accessibility and safe UI moments are not reconstructable; eligibility gates relaxed only for behavioral replay.",
      "Existing emails/promotions and the model release influenced observed outcomes.",
      "Email positives include early natural returners who are deliberately ineligible for a 48h inactivity reminder.",
      "Only tracked identifiable people in this extract; missing/opted-out activity and internal accounts can affect results.",
      "Small buyer count; do not optimize thresholds against these same outcomes.",
    ],
  };
}
if (process.argv[2]) {
  const raw = fs.readFileSync(process.argv[2], "utf8");
  const report = { ...replayHistory(JSON.parse(raw)), inputSha256: createHash("sha256").update(raw).digest("hex") };
  fs.writeFileSync(process.argv[3] || "/tmp/engagement-backtest.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
