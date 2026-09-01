import type { PostHog } from "posthog-node";

export type ReminderSchedulerName = "inactive_signup" | "tab_return";

export function captureReminderRun(
  posthog: Pick<PostHog, "capture"> | null,
  input: {
    scheduler: ReminderSchedulerName;
    startedAt: number;
    scanned: number;
    batchSize: number;
    eligible: number;
    sent: number;
    failed: number;
    dryRun: boolean;
  }
) {
  const backlogSuspected = input.scanned >= input.batchSize;
  posthog?.capture({
    distinctId: `system:reminder-scheduler:${input.scheduler}`,
    event: "reminder_scheduler_run_completed",
    properties: {
      scheduler: input.scheduler,
      status: input.failed > 0 ? "completed_with_delivery_errors" : "healthy",
      scanned: input.scanned,
      eligible: input.eligible,
      sent: input.sent,
      delivery_failures: input.failed,
      batch_size: input.batchSize,
      backlog_suspected: backlogSuspected,
      dry_run: input.dryRun,
      runtime_ms: Math.max(0, Date.now() - input.startedAt),
    },
  });
  if (backlogSuspected) {
    posthog?.capture({
      distinctId: `system:reminder-scheduler:${input.scheduler}`,
      event: "reminder_scheduler_backlog_detected",
      properties: { scheduler: input.scheduler, scanned: input.scanned, batch_size: input.batchSize },
    });
  }
}

export function captureReminderFailure(
  posthog: Pick<PostHog, "capture"> | null,
  scheduler: ReminderSchedulerName,
  startedAt: number,
  error: unknown
) {
  posthog?.capture({
    distinctId: `system:reminder-scheduler:${scheduler}`,
    event: "reminder_scheduler_failed",
    properties: {
      scheduler,
      runtime_ms: Math.max(0, Date.now() - startedAt),
      error_type: error instanceof Error ? error.name : "UnknownError",
    },
  });
}

export function captureReminderDeliveryFailure(
  posthog: Pick<PostHog, "capture"> | null,
  scheduler: ReminderSchedulerName,
  userId: string,
  error: unknown
) {
  posthog?.capture({
    distinctId: userId,
    event: "reminder_email_delivery_failed",
    properties: {
      scheduler,
      error_type: error instanceof Error ? error.name : "DeliveryDisabled",
    },
  });
}
