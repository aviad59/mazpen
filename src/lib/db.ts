/**
 * Lightweight IndexedDB wrapper for Matzpen Commander.
 * No external deps — keeps the bundle tiny and the contract explicit.
 *
 * Stores:
 *   - discussions (key: id)
 *   - participants (key: id)
 *
 * On first open we seed the DB from `./seed.ts`.
 */

import type { Discussion, Participant } from "@/types";
import { SEED_DISCUSSIONS, SEED_PARTICIPANTS } from "./seed";

const DB_NAME = "matzpen-commander";
const DB_VERSION = 1;
const DISC_STORE = "discussions";
const PART_STORE = "participants";
const META_STORE = "meta";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DISC_STORE)) {
        const s = db.createObjectStore(DISC_STORE, { keyPath: "id" });
        s.createIndex("by_status", "status");
        s.createIndex("by_scheduledAt", "scheduledAt");
      }
      if (!db.objectStoreNames.contains(PART_STORE)) {
        db.createObjectStore(PART_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };

    req.onsuccess = async () => {
      const db = req.result;
      // Seed on first open
      try {
        const seeded = await getMeta(db, "seeded");
        if (!seeded) {
          await bulkPut(db, PART_STORE, SEED_PARTICIPANTS);
          await bulkPut(db, DISC_STORE, SEED_DISCUSSIONS);
          await setMeta(db, "seeded", true);
        }
      } catch (e) {
        // Non-fatal — DB still works, just no seed
        console.warn("Seed failed:", e);
      }
      resolve(db);
    };

    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

function tx(db: IDBDatabase, store: string, mode: IDBTransactionMode) {
  const t = db.transaction(store, mode);
  return t.objectStore(store);
}

function getMeta(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((res, rej) => {
    const req = tx(db, META_STORE, "readonly").get(key);
    req.onsuccess = () => res((req.result as { value: unknown } | undefined)?.value);
    req.onerror = () => rej(req.error);
  });
}

function setMeta(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((res, rej) => {
    const req = tx(db, META_STORE, "readwrite").put({ key, value });
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}

function bulkPut<T>(db: IDBDatabase, store: string, items: T[]): Promise<void> {
  return new Promise((res, rej) => {
    const t = db.transaction(store, "readwrite");
    const s = t.objectStore(store);
    items.forEach((it) => s.put(it as unknown as IDBValidKey));
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

function getAllFromStore<T>(store: string): Promise<T[]> {
  return openDB().then(
    (db) =>
      new Promise<T[]>((res, rej) => {
        const req = tx(db, store, "readonly").getAll();
        req.onsuccess = () => res(req.result as T[]);
        req.onerror = () => rej(req.error);
      })
  );
}

// ----- Public API -------------------------------------------------------

export async function listDiscussions(): Promise<Discussion[]> {
  return getAllFromStore<Discussion>(DISC_STORE);
}

export async function listParticipants(): Promise<Participant[]> {
  return getAllFromStore<Participant>(PART_STORE);
}

export async function putDiscussion(d: Discussion): Promise<void> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = tx(db, DISC_STORE, "readwrite").put(d);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}

export async function deleteDiscussion(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = tx(db, DISC_STORE, "readwrite").delete(id);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}

export async function putParticipant(p: Participant): Promise<void> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const req = tx(db, PART_STORE, "readwrite").put(p);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}

export async function resetAndReseed(): Promise<void> {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const t = db.transaction([DISC_STORE, PART_STORE, META_STORE], "readwrite");
    t.objectStore(DISC_STORE).clear();
    t.objectStore(PART_STORE).clear();
    t.objectStore(META_STORE).clear();
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
  await bulkPut(db, PART_STORE, SEED_PARTICIPANTS);
  await bulkPut(db, DISC_STORE, SEED_DISCUSSIONS);
  await setMeta(db, "seeded", true);
}
