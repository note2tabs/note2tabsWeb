export type ApiError = {
  code?: string;
  message: string;
  requestId?: string;
};

type FetchOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
};

async function fetchWithTimeout(input: RequestInfo, init: FetchOptions) {
  const timeoutMs = init.timeoutMs ?? 15000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export async function apiFetch<T = any>(path: string, init: FetchOptions = {}): Promise<T> {
  const retries = init.retries ?? 0;
  let attempt = 0;
  while (true) {
    try {
      const response = await fetchWithTimeout(path, init);
      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      const payload = isJson ? await response.json().catch(() => null) : await response.text();
      if (!response.ok) {
        const error = payload?.error || {};
        const message = error.message || payload?.error || response.statusText || "Request failed";
        const apiError: ApiError = {
          code: error.code,
          message,
          requestId: payload?.requestId,
        };
        throw apiError;
      }
      return payload as T;
    } catch (error) {
      attempt += 1;
      if (attempt > retries || (error as any)?.name === "AbortError") {
        throw error;
      }
    }
  }
}
