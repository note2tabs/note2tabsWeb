const DATABASE_NAME = "note2tabs-practice-replays";
const DATABASE_VERSION = 1;
const STORE_NAME = "audio";

const openReplayAudioDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Replay audio storage is not available in this browser."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Replay audio storage could not be opened."));
  });

const runReplayAudioRequest = <T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
) =>
  openReplayAudioDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const request = operation(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Replay audio storage failed."));
        transaction.oncomplete = () => database.close();
        transaction.onabort = () => {
          database.close();
          reject(transaction.error ?? new Error("Replay audio storage was interrupted."));
        };
      })
  );

export const storePracticeReplayAudio = (key: string, audio: Blob) =>
  runReplayAudioRequest<IDBValidKey>("readwrite", (store) => store.put(audio, key)).then(
    () => undefined
  );

export const readPracticeReplayAudio = (key: string) =>
  runReplayAudioRequest<Blob | undefined>("readonly", (store) => store.get(key));

export const deletePracticeReplayAudio = (key: string) =>
  runReplayAudioRequest<undefined>("readwrite", (store) => store.delete(key)).then(
    () => undefined
  );
