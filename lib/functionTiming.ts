type FunctionTiming = {
  route: string;
  startedAt: number;
  status: number;
  details?: Record<string, unknown>;
};

const SLOW_FUNCTION_MS = 750;

export function logFunctionTiming(input: FunctionTiming) {
  const durationMs = Date.now() - input.startedAt;
  if (durationMs < SLOW_FUNCTION_MS && process.env.NOTE2TABS_PERF_LOGS !== "true") return;
  console.info(JSON.stringify({
    level: "info",
    message: "function_timing",
    route: input.route,
    durationMs,
    status: input.status,
    ...input.details,
  }));
}

export function attachFunctionTiming(
  res: { statusCode: number; once?: (event: string, listener: () => void) => unknown },
  route: string,
  details?: () => Record<string, unknown>
) {
  const startedAt = Date.now();
  res.once?.("finish", () => logFunctionTiming({
    route,
    startedAt,
    status: res.statusCode,
    details: details?.(),
  }));
}
