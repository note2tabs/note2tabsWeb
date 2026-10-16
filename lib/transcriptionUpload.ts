/** Diagnostics must never contain the signed URL, object key, filename or raw response. */
export type UploadFailureDetails = {
  http_status?: number;
  request_id?: string;
  storage_error_code?: string;
  storage_error_reason?: "request_expired";
  upload_failure_kind?: "http" | "network";
  upload_attempt?: number;
  upload_elapsed_ms?: number;
  upload_browser_online?: boolean;
};

export class TranscriptionUploadError extends Error {
  constructor(
    message: string,
    public readonly stage: "upload_presign" | "upload_storage",
    public readonly details: UploadFailureDetails,
  ) {
    super(message);
    this.name = "TranscriptionUploadError";
  }

  get analyticsCode() {
    return this.details.upload_failure_kind === "network" ? "network_error"
      : this.stage === "upload_presign" ? "presign_rejected" : "storage_failed";
  }
}

const STORAGE_CODES: Record<string, string> = {
  AccessDenied: "access_denied", SignatureDoesNotMatch: "signature_does_not_match",
  ExpiredToken: "expired_token", RequestTimeTooSkewed: "request_time_too_skewed",
  AccountProblem: "account_problem", UserProjectAccountProblem: "user_project_account_problem",
  InvalidAccessKeyId: "invalid_access_key_id", InvalidSecurity: "invalid_security",
  InvalidArgument: "invalid_argument", EntityTooLarge: "entity_too_large",
  SlowDown: "slow_down", InternalError: "internal_error", ServiceUnavailable: "service_unavailable",
  NoSuchBucket: "no_such_bucket", CountryBlocked: "country_blocked", countryBlocked: "country_blocked",
};

function safeRequestId(response: Response) {
  const id = response.headers.get("x-guploader-uploadid") || response.headers.get("x-request-id");
  return id && /^[a-zA-Z0-9_:.-]{1,256}$/.test(id) ? id : undefined;
}

async function storageFailure(response: Response): Promise<UploadFailureDetails> {
  // Bound both bytes and time: an error page must not hold up the retry UI.
  const reader = response.body?.getReader();
  let xml = "";
  if (reader) {
    const timer = setTimeout(() => { void reader.cancel().catch(() => {}); }, 1000);
    try {
      let remaining = 8192;
      while (remaining > 0) {
        const { done, value } = await reader.read();
        if (done) break;
        xml += new TextDecoder().decode(value.subarray(0, remaining));
        remaining -= value.byteLength;
      }
    } catch { /* Keep the HTTP status even if reading the body fails. */ }
    finally {
      clearTimeout(timer);
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  const isXmlError = /^\s*(?:<\?xml[^>]*\?>\s*)?<Error(?:\s[^>]*)?>/.test(xml);
  const code = isXmlError ? /<Code>\s*([A-Za-z]+)\s*<\/Code>/.exec(xml)?.[1] : undefined;
  const expired = code === "ExpiredToken" || (code === "AccessDenied" &&
    (/<Message>\s*Request has expired\s*<\/Message>/.test(xml) || /<Details>\s*Request (?:has )?expired at:/.test(xml)));
  return {
    http_status: response.status,
    request_id: safeRequestId(response),
    storage_error_code: (code && Object.prototype.hasOwnProperty.call(STORAGE_CODES, code) && STORAGE_CODES[code]) || "unknown",
    ...(expired ? { storage_error_reason: "request_expired" as const } : {}),
    upload_failure_kind: "http",
  };
}

type SignedUpload = { url: string; key: string };

/** Only a confirmed expired capability is retried, once, before any transcription request. */
export async function uploadTranscriptionFile(
  file: File,
  fileName: string,
  errorMessage: string,
  onExpiredRetry: (details: UploadFailureDetails) => void = () => {},
): Promise<string> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let signed: SignedUpload;
    try {
      const response = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, contentType: file.type || "application/octet-stream", size: file.size }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data?.url !== "string" || !data.url || typeof data?.key !== "string" || !data.key) {
        throw new TranscriptionUploadError(typeof data?.error === "string" ? data.error : errorMessage,
          "upload_presign", { http_status: response.status, request_id: safeRequestId(response), upload_attempt: attempt });
      }
      signed = data;
    } catch (error) {
      if (error instanceof TranscriptionUploadError) throw error;
      throw new TranscriptionUploadError(errorMessage, "upload_presign", { upload_failure_kind: "network", upload_attempt: attempt });
    }

    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(signed.url, {
        method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file,
      });
    } catch {
      throw new TranscriptionUploadError(errorMessage, "upload_storage", {
        upload_failure_kind: "network", upload_attempt: attempt,
        upload_elapsed_ms: Math.max(0, Date.now() - started),
        upload_browser_online: typeof navigator === "undefined" ? undefined : navigator.onLine,
      });
    }
    if (response.ok) return signed.key;
    const elapsed = Math.max(0, Date.now() - started);
    const details: UploadFailureDetails = {
      ...await storageFailure(response), upload_attempt: attempt, upload_elapsed_ms: elapsed,
      upload_browser_online: typeof navigator === "undefined" ? undefined : navigator.onLine,
    };
    if (attempt === 1 && response.status === 403 && details.storage_error_reason === "request_expired") {
      try { onExpiredRetry(details); } catch { /* Analytics must not prevent recovery. */ }
      continue;
    }
    throw new TranscriptionUploadError(errorMessage, "upload_storage", details);
  }
  throw new TranscriptionUploadError(errorMessage, "upload_storage", {});
}
