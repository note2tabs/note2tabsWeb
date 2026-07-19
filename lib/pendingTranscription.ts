export type PendingTranscription =
  | {
      mode: "FILE";
      file: File;
      fileName?: string;
      fileType?: string;
      fileLastModified?: number;
      fileStartTime: number;
      fileEndTime: number;
      savedAt: number;
    }
  | {
      mode: "YOUTUBE";
      youtubeUrl: string;
      startTime: number;
      endTime: number;
      savedAt: number;
    };

const DATABASE_NAME = "note2tabs-auth-handoff";
const STORE_NAME = "pending-transcriptions";
const RECORD_KEY = "current";
const MAX_AGE_MS = 30 * 60 * 1000;
let takeInFlight: Promise<PendingTranscription | null> | null = null;
let peekInFlight: Promise<PendingTranscription | null> | null = null;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Browser storage is unavailable."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open browser storage."));
  });
}

async function runTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
) {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      let requestCompleted = false;
      let requestResult: T;

      request.onsuccess = () => {
        requestCompleted = true;
        requestResult = request.result;
      };
      transaction.oncomplete = () => {
        if (!requestCompleted) {
          reject(request.error || new Error("Browser storage failed."));
          return;
        }
        resolve(requestResult);
      };
      request.onerror = () => {
        // The request error aborts the transaction by default. Wait for the
        // transaction outcome so callers never navigate before the write has
        // either committed or definitively failed.
      };
      transaction.onerror = () => {
        // `onabort` carries the authoritative transaction outcome.
      };
      transaction.onabort = () => reject(transaction.error || new Error("Browser storage was interrupted."));
    });
  } finally {
    database.close();
  }
}

export async function savePendingTranscription(value: PendingTranscription) {
  const storedValue =
    value.mode === "FILE"
      ? {
          ...value,
          fileName: value.file.name,
          fileType: value.file.type,
          fileLastModified: value.file.lastModified,
        }
      : value;
  await runTransaction("readwrite", (store) => store.put(storedValue, RECORD_KEY));
}

async function readPendingTranscription(consume: boolean): Promise<PendingTranscription | null> {
  const database = await openDatabase();
  let value: PendingTranscription | undefined;
  try {
    value = await new Promise<PendingTranscription | undefined>((resolve, reject) => {
      // A readwrite transaction lets an expired record be removed atomically
      // with the read. A later save cannot be erased by stale cleanup.
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(RECORD_KEY) as IDBRequest<PendingTranscription | undefined>;
      request.onsuccess = () => {
        const storedValue = request.result;
        const expired = Boolean(storedValue && Date.now() - storedValue.savedAt > MAX_AGE_MS);
        value = expired ? undefined : storedValue;
        if ((consume && storedValue) || expired) {
          store.delete(RECORD_KEY);
        }
      };
      request.onerror = () => {
        // The transaction abort handler below reports the final failure.
      };
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => {
        // Wait for `onabort` so completion and failure are transaction-bound.
      };
      transaction.onabort = () => reject(transaction.error || request.error || new Error("Browser storage was interrupted."));
    });
  } finally {
    database.close();
  }

  if (!value) return null;

  if (value.mode === "FILE" && !(value.file instanceof File)) {
    const storedBlob = value.file as unknown as Blob;
    return {
      ...value,
      file: new File([storedBlob], value.fileName || "audio-upload", {
        type: value.fileType || storedBlob.type || "application/octet-stream",
        lastModified: value.fileLastModified || value.savedAt,
      }),
    };
  }
  return value;
}

export async function clearPendingTranscription() {
  await runTransaction("readwrite", (store) => store.delete(RECORD_KEY));
}

export async function peekPendingTranscription(): Promise<PendingTranscription | null> {
  if (peekInFlight) return peekInFlight;
  peekInFlight = readPendingTranscription(false).finally(() => {
    peekInFlight = null;
  });
  return peekInFlight;
}

export async function takePendingTranscription(): Promise<PendingTranscription | null> {
  if (takeInFlight) return takeInFlight;
  takeInFlight = readPendingTranscription(true).finally(() => {
    takeInFlight = null;
  });
  return takeInFlight;
}
