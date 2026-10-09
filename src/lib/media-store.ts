// Large recordings (voice, video) live in IndexedDB so they don't fill the ~5 MB localStorage
// fallback copy. A thought's attachment keeps only a small `idb:<id>` reference in `data`.
// Exports and folder saves resolve references back to real bytes first (see hydrateDesk).
import type { DeskData } from "./desk-package";

const DB_NAME = "horixon_media";
const STORE = "blobs";
export const MEDIA_PREFIX = "idb:";
// Imported data URLs larger than this are moved to IndexedDB instead of living in localStorage.
const MIGRATE_ABOVE = 200 * 1024;

export const isMediaRef = (data: string) => data.startsWith(MEDIA_PREFIX);

let dbPromise: Promise<IDBDatabase> | undefined;
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined")
        return reject(new Error("This browser can't store recordings."));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Could not open the recordings store."));
    }).catch((error) => {
      dbPromise = undefined;
      throw error;
    });
  }
  return dbPromise!;
}

function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error ?? new Error("Recording could not be stored."));
        tx.onabort = () => reject(tx.error ?? new Error("Recording could not be stored."));
      }),
  );
}

/** Stores a blob and returns its reference. Rejects (so callers never claim success) if the write fails. */
export async function saveBlob(blob: Blob): Promise<string> {
  const ref = `${MEDIA_PREFIX}${crypto.randomUUID()}`;
  await run("readwrite", (store) => store.put(blob, ref));
  return ref;
}

export async function loadBlob(ref: string): Promise<Blob | undefined> {
  return run<Blob | undefined>("readonly", (store) => store.get(ref));
}

export const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read a recording."));
    reader.readAsDataURL(blob);
  });

const dataUrlToBlob = (data: string) => {
  const match = /^data:([^;,]*)(?:;base64)?,([\s\S]*)$/.exec(data);
  if (!match) return null;
  const bytes = Uint8Array.from(atob(match[2]!), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: match[1] || "application/octet-stream" });
};

/** A copy of the desk with every media reference replaced by a data URL, ready for export or a folder write. */
export async function hydrateDesk<T extends DeskData>(desk: T): Promise<T> {
  const thoughts = await Promise.all(
    desk.thoughts.map(async (thought) => {
      if (!thought.attachments?.some((a) => isMediaRef(a.data))) return thought;
      const attachments = await Promise.all(
        thought.attachments.map(async (a) => {
          if (!isMediaRef(a.data)) return a;
          const blob = await loadBlob(a.data);
          if (!blob)
            throw new Error(
              `The recording "${a.name}" is missing from this browser. Remove it or reattach the file.`,
            );
          return { ...a, data: await blobToDataUrl(blob), mime: a.mime ?? blob.type };
        }),
      );
      return { ...thought, attachments };
    }),
  );
  return { ...desk, thoughts };
}

/** After an import or folder open: move big audio/video data URLs into IndexedDB so the desk stays saveable. */
export async function migrateDeskMedia<T extends DeskData>(desk: T): Promise<T> {
  const thoughts = await Promise.all(
    desk.thoughts.map(async (thought) => {
      if (
        !thought.attachments?.some(
          (a) => /^data:(audio|video)\//.test(a.data) && a.data.length > MIGRATE_ABOVE,
        )
      )
        return thought;
      const attachments = await Promise.all(
        thought.attachments.map(async (a) => {
          if (!/^data:(audio|video)\//.test(a.data) || a.data.length <= MIGRATE_ABOVE) return a;
          const blob = dataUrlToBlob(a.data);
          if (!blob) return a;
          return { ...a, data: await saveBlob(blob), mime: a.mime ?? blob.type };
        }),
      );
      return { ...thought, attachments };
    }),
  );
  return { ...desk, thoughts };
}

export type MediaFile = { name: string; data: string; mime?: string | undefined };

/** Whether an attachment is playable audio or video (from its stored type or its data URL). */
export const mediaKind = (file: MediaFile): "audio" | "video" | "other" => {
  const mime = file.mime ?? /^data:([^;,]+)/.exec(file.data)?.[1] ?? "";
  return mime.startsWith("audio/") ? "audio" : mime.startsWith("video/") ? "video" : "other";
};
