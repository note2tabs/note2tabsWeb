import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RequestHarness = {
  request: {
    result: unknown;
    error: Error | null;
    onsuccess: null | (() => void);
    onerror: null | (() => void);
  };
};

type TransactionHarness = {
  transaction: {
    error: Error | null;
    oncomplete: null | (() => void);
    onerror: null | (() => void);
    onabort: null | (() => void);
  };
  requests: RequestHarness[];
  store: {
    get: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};

const transactions: TransactionHarness[] = [];
const closeMocks: Array<ReturnType<typeof vi.fn>> = [];

function createRequest(harness: TransactionHarness) {
  const requestHarness: RequestHarness = {
    request: {
      result: undefined,
      error: null,
      onsuccess: null,
      onerror: null,
    },
  };
  harness.requests.push(requestHarness);
  return requestHarness.request;
}

function installIndexedDbMock() {
  const indexedDb = {
    open: vi.fn(() => {
      const close = vi.fn();
      closeMocks.push(close);
      const database = {
        objectStoreNames: { contains: vi.fn(() => true) },
        createObjectStore: vi.fn(),
        close,
        transaction: vi.fn(() => {
          const harness = {
            transaction: {
              error: null,
              oncomplete: null,
              onerror: null,
              onabort: null,
            },
            requests: [],
            store: {} as TransactionHarness["store"],
          } satisfies TransactionHarness;
          harness.store = {
            get: vi.fn(() => createRequest(harness)),
            put: vi.fn(() => createRequest(harness)),
            delete: vi.fn(() => createRequest(harness)),
          };
          (harness.transaction as typeof harness.transaction & { objectStore: () => typeof harness.store }).objectStore =
            () => harness.store;
          transactions.push(harness);
          return harness.transaction;
        }),
      };
      const request = {
        result: database,
        error: null,
        onupgradeneeded: null as null | (() => void),
        onsuccess: null as null | (() => void),
        onerror: null as null | (() => void),
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    }),
  };

  vi.stubGlobal("indexedDB", indexedDb);
}

async function waitForTransaction(index = 0) {
  for (let attempt = 0; attempt < 10 && !transactions[index]; attempt += 1) {
    await Promise.resolve();
  }
  const harness = transactions[index];
  if (!harness) throw new Error("IndexedDB transaction was not created.");
  return harness;
}

function succeed(requestHarness: RequestHarness, result?: unknown) {
  requestHarness.request.result = result;
  requestHarness.request.onsuccess?.();
}

beforeEach(() => {
  transactions.length = 0;
  closeMocks.length = 0;
  installIndexedDbMock();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pending transcription storage", () => {
  it("does not resolve a save until its transaction commits", async () => {
    const { savePendingTranscription } = await import("../../lib/pendingTranscription");
    let settled = false;
    const save = savePendingTranscription({
      mode: "YOUTUBE",
      youtubeUrl: "https://www.youtube.com/watch?v=test",
      startTime: 0,
      endTime: 30,
      savedAt: Date.now(),
    }).finally(() => {
      settled = true;
    });
    const harness = await waitForTransaction();

    succeed(harness.requests[0]);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(closeMocks[0]).not.toHaveBeenCalled();

    harness.transaction.oncomplete?.();
    await expect(save).resolves.toBeUndefined();
    expect(closeMocks[0]).toHaveBeenCalledOnce();
  });

  it("rejects a delete when the transaction aborts", async () => {
    const { clearPendingTranscription } = await import("../../lib/pendingTranscription");
    const clearing = clearPendingTranscription();
    const harness = await waitForTransaction();

    succeed(harness.requests[0]);
    harness.transaction.error = new Error("quota failure");
    harness.transaction.onabort?.();

    await expect(clearing).rejects.toThrow("quota failure");
    expect(closeMocks[0]).toHaveBeenCalledOnce();
  });

  it("shares concurrent peeks and removes an expired record in the read transaction", async () => {
    const { peekPendingTranscription } = await import("../../lib/pendingTranscription");
    const firstPeek = peekPendingTranscription();
    const secondPeek = peekPendingTranscription();
    const harness = await waitForTransaction();

    expect(transactions).toHaveLength(1);
    succeed(harness.requests[0], {
      mode: "YOUTUBE",
      youtubeUrl: "https://www.youtube.com/watch?v=expired",
      startTime: 0,
      endTime: 30,
      savedAt: Date.now() - 31 * 60 * 1000,
    });
    expect(harness.store.delete).toHaveBeenCalledWith("current");
    harness.transaction.oncomplete?.();

    await expect(Promise.all([firstPeek, secondPeek])).resolves.toEqual([null, null]);
    expect(transactions).toHaveLength(1);
  });
});
