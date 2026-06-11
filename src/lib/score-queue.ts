"use client";

// IndexedDB-backed offline write queue for score entries. Each entry is keyed
// by (round_id, match_id, player_id|team_side, hole_number) so re-saving the
// same hole replaces the queued write rather than stacking. Last-write-wins.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export type ScoreWrite = {
  round_id: string;
  match_id: string | null; // null for solo-format rounds (medal, stableford…)
  team_side: "A" | "B" | null;
  player_id: string | null;
  hole_number: number;
  gross: number;
};

export type QueuedWrite = ScoreWrite & {
  key: string;
  status: "queued" | "syncing" | "saved" | "error";
  error?: string;
  updated_at: number;
};

const DB_NAME = "bobo-scores";
const STORE = "queue";
const DB_VERSION = 1;

function keyFor(w: ScoreWrite): string {
  const who = w.player_id ?? `team:${w.team_side}`;
  return `${w.round_id}|${w.match_id ?? "solo"}|${who}|${w.hole_number}`;
}

let _dbPromise: Promise<IDBDatabase> | null = null;
function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function txStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDB();
  return db.transaction(STORE, mode).objectStore(STORE);
}

async function putItem(item: QueuedWrite): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const store = await txStore("readwrite");
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

async function deleteItem(key: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const store = await txStore("readwrite");
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

async function getAll(): Promise<QueuedWrite[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const store = await txStore("readonly");
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result ?? []) as QueuedWrite[]);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

// In-memory mirror of the queue, used as the React store. We keep this small
// and update it through the same code paths that touch IndexedDB.
type Subscriber = () => void;
const subs = new Set<Subscriber>();
let memory: QueuedWrite[] = [];

function notify() {
  for (const s of subs) s();
}

async function load() {
  try {
    memory = await getAll();
  } catch {
    memory = [];
  }
  notify();
}

/**
 * `useScoreQueue(save)` returns the current queue snapshot, an `enqueue`
 * function for new writes, and a `pending` count. It auto-flushes:
 *  - on mount
 *  - whenever a new write is enqueued
 *  - whenever the browser comes back online
 *
 * `save` is the network call that actually persists to Supabase. It receives
 * the bare ScoreWrite (no key/status) and should resolve on success or reject.
 */
export function useScoreQueue(save: (w: ScoreWrite) => Promise<void>) {
  const saveRef = useRef(save);
  saveRef.current = save;

  const [, setLoaded] = useState(false);

  const queue = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    () => memory,
    () => memory
  );

  const flush = useCallback(async () => {
    const items = (await getAll()).filter((q) => q.status !== "saved");
    for (const item of items) {
      try {
        await putItem({ ...item, status: "syncing" });
        memory = memory.map((m) => (m.key === item.key ? { ...m, status: "syncing" } : m));
        notify();
        await saveRef.current({
          round_id: item.round_id,
          match_id: item.match_id,
          team_side: item.team_side,
          player_id: item.player_id,
          hole_number: item.hole_number,
          gross: item.gross,
        });
        await deleteItem(item.key);
        memory = memory.filter((m) => m.key !== item.key);
        notify();
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        const failed: QueuedWrite = { ...item, status: "error", error, updated_at: Date.now() };
        await putItem(failed);
        memory = memory.map((m) => (m.key === item.key ? failed : m));
        notify();
        // Bail out — common cause is offline; retry on next online event.
        return;
      }
    }
  }, []);

  const enqueue = useCallback(
    async (write: ScoreWrite) => {
      const key = keyFor(write);
      const item: QueuedWrite = {
        ...write,
        key,
        status: "queued",
        updated_at: Date.now(),
      };
      // Update memory + IDB up front so the UI flips to "Will sync" instantly.
      memory = [...memory.filter((m) => m.key !== key), item];
      notify();
      try {
        await putItem(item);
      } catch {
        // IDB unavailable — fall through to attempt direct save.
      }
      // Fire-and-forget. flush() handles errors and persists status.
      flush();
    },
    [flush]
  );

  // Mount: load existing queue + flush + wire online listener.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
      setLoaded(true);
      flush();
    })();

    const onOnline = () => flush();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, [flush]);

  return {
    queue,
    enqueue,
    flush,
    pending: queue.filter((q) => q.status !== "saved").length,
    keyFor,
  } as const;
}

export { keyFor };
