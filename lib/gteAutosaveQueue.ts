export type AutosaveReason =
  | "change"
  | "debounce"
  | "interval"
  | "lifecycle"
  | "online"
  | "queued"
  | "pre-server-mutation"
  | "unmount"
  | string;

export type AutosaveContext = {
  revision: number;
  reason: AutosaveReason;
  isLatest: boolean;
};

export type RevisionedAutosaveState = {
  revision: number;
  savedRevision: number;
  pending: boolean;
  saving: boolean;
  waitingForConnection: boolean;
  retryAttempt: number;
};

type RevisionedAutosaveOptions<TPayload, TResult> = {
  save: (payload: TPayload, context: Omit<AutosaveContext, "isLatest">) => Promise<TResult>;
  debounceMs?: number;
  retryDelaysMs?: number[];
  isOnline?: () => boolean;
  onSaved?: (result: TResult, context: AutosaveContext) => void;
  onError?: (error: unknown, context: AutosaveContext) => void;
  onStateChange?: (state: RevisionedAutosaveState) => void;
};

type FlushOptions = {
  reason?: AutosaveReason;
  throwOnError?: boolean;
};

const DEFAULT_RETRY_DELAYS_MS = [1_000, 3_000, 10_000, 30_000];

/**
 * Keeps only the newest editor snapshot, persists one revision at a time, and
 * backs off after failures. The queue is intentionally in-memory: editor
 * drafts remain owned by the existing durable storage layer rather than being
 * copied into localStorage, where large scores can exceed browser quotas.
 */
export class RevisionedAutosaveQueue<TPayload, TResult> {
  private options: RevisionedAutosaveOptions<TPayload, TResult>;
  private latest: { payload: TPayload; revision: number; reason: AutosaveReason } | null = null;
  private revision = 0;
  private savedRevision = 0;
  private retryAttempt = 0;
  private waitingForConnection = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private generation = 0;

  constructor(options: RevisionedAutosaveOptions<TPayload, TResult>) {
    this.options = options;
  }

  configure(options: Partial<RevisionedAutosaveOptions<TPayload, TResult>>) {
    this.options = { ...this.options, ...options };
  }

  getState(): RevisionedAutosaveState {
    return {
      revision: this.revision,
      savedRevision: this.savedRevision,
      pending: this.revision > this.savedRevision,
      saving: this.inFlight !== null,
      waitingForConnection: this.waitingForConnection,
      retryAttempt: this.retryAttempt,
    };
  }

  enqueue(payload: TPayload, reason: AutosaveReason = "change") {
    this.revision += 1;
    this.latest = { payload, revision: this.revision, reason };
    this.waitingForConnection = false;
    this.retryAttempt = 0;
    this.schedule(this.options.debounceMs ?? 2_500);
    this.emitState();
    return this.revision;
  }

  markSynced() {
    this.clearTimer();
    this.revision += 1;
    this.savedRevision = this.revision;
    this.latest = null;
    this.retryAttempt = 0;
    this.waitingForConnection = false;
    this.emitState();
    return this.revision;
  }

  async flushLatest(options: FlushOptions = {}) {
    this.clearTimer();
    if (this.inFlight) {
      await this.inFlight;
    }
    if (!this.latest || this.latest.revision <= this.savedRevision) return;

    const online = this.options.isOnline?.() ?? true;
    if (!online) {
      this.waitingForConnection = true;
      this.emitState();
      if (options.throwOnError) {
        throw new Error("The editor is offline. Changes are queued until the connection returns.");
      }
      return;
    }

    const target = this.latest;
    const generation = this.generation;
    const reason = options.reason ?? target.reason;
    this.waitingForConnection = false;
    let failed = false;
    const request = this.options
      .save(target.payload, { revision: target.revision, reason })
      .then((result) => {
        if (generation !== this.generation) return;
        this.savedRevision = Math.max(this.savedRevision, target.revision);
        this.retryAttempt = 0;
        const isLatest = target.revision === this.revision;
        this.options.onSaved?.(result, {
          revision: target.revision,
          reason,
          isLatest,
        });
      })
      .catch((error: unknown) => {
        if (generation !== this.generation) return;
        failed = true;
        const isLatest = target.revision === this.revision;
        this.options.onError?.(error, {
          revision: target.revision,
          reason,
          isLatest,
        });
        if (options.throwOnError) throw error;
      })
      .finally(() => {
        if (generation !== this.generation) return;
        this.inFlight = null;
        if (failed) {
          this.retryAttempt += 1;
          if (this.options.isOnline?.() === false) {
            this.waitingForConnection = true;
          } else {
            const delays = this.options.retryDelaysMs?.length
              ? this.options.retryDelaysMs
              : DEFAULT_RETRY_DELAYS_MS;
            const delay = delays[Math.min(this.retryAttempt - 1, delays.length - 1)];
            this.schedule(delay);
          }
        } else if (this.revision > this.savedRevision) {
          this.schedule(0);
        }
        this.emitState();
      });

    this.inFlight = request;
    this.emitState();
    await request;
  }

  async flushThroughLatest(options: FlushOptions = {}) {
    while (this.revision > this.savedRevision) {
      const savedBefore = this.savedRevision;
      await this.flushLatest(options);
      if (this.savedRevision === savedBefore) return;
    }
  }

  notifyOnline() {
    if (!this.getState().pending) return;
    this.waitingForConnection = false;
    this.retryAttempt = 0;
    this.clearTimer();
    void this.flushLatest({ reason: "online" });
  }

  reset() {
    this.generation += 1;
    this.clearTimer();
    this.latest = null;
    this.revision = 0;
    this.savedRevision = 0;
    this.retryAttempt = 0;
    this.waitingForConnection = false;
    this.inFlight = null;
    this.emitState();
  }

  dispose() {
    this.generation += 1;
    this.clearTimer();
    this.latest = null;
    this.inFlight = null;
  }

  private schedule(delayMs: number) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flushLatest({ reason: "debounce" });
    }, Math.max(0, delayMs));
  }

  private clearTimer() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private emitState() {
    this.options.onStateChange?.(this.getState());
  }
}
