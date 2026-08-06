const TRANSIENT_PRISMA_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);

function transientPrismaCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { code?: unknown; errorCode?: unknown };
  const code = typeof candidate.code === "string"
    ? candidate.code
    : typeof candidate.errorCode === "string"
      ? candidate.errorCode
      : null;
  return code && TRANSIENT_PRISMA_CODES.has(code) ? code : null;
}

function isTransientPrismaConnectionError(error: unknown) {
  if (transientPrismaCode(error)) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; message?: unknown };
  return candidate.name === "PrismaClientInitializationError" &&
    typeof candidate.message === "string" &&
    candidate.message.includes("Can't reach database server");
}

/**
 * Retries read-only database work after a connection/pool interruption.
 * Callers must not use this for non-idempotent writes.
 */
export async function withPrismaReadRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  const safeAttempts = Math.max(1, attempts);

  for (let attempt = 0; attempt < safeAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientPrismaConnectionError(error) || attempt === safeAttempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }

  throw lastError;
}
