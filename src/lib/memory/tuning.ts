/**
 * TuningMemory (§11): parameter sets that worked, by image class. IndexedDB, no images.
 */
import type { Params } from "../core/schema";
import { SCHEMA_VERSION } from "../core/schema";
import type { ImageClass } from "../pipeline/run";

export interface TuningEntry {
  id?: number;
  image_class: ImageClass;
  params: Params;
  final_score: number;
  passed: boolean;
  rounds_needed: number;
  schema_version: number;
  timestamp: number;
}

const DB = "headshot-outline";
const STORE = "tuning";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    t.oncomplete = () => db.close();
  });
}

export async function addEntry(e: Omit<TuningEntry, "id" | "schema_version" | "timestamp">): Promise<void> {
  await tx("readwrite", (s) => s.add({ ...e, schema_version: SCHEMA_VERSION, timestamp: Date.now() }));
}

export async function listEntries(): Promise<TuningEntry[]> {
  try {
    return (await tx<TuningEntry[]>("readonly", (s) => s.getAll() as IDBRequest<TuningEntry[]>)).sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

export async function deleteEntry(id: number): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

export async function clearEntries(): Promise<void> {
  await tx("readwrite", (s) => s.clear());
}

export function classMatch(a: ImageClass, b: ImageClass): number {
  return (a.pose === b.pose ? 1 : 0) + (a.hair === b.hair ? 1 : 0) + (a.accessories === b.accessories ? 1 : 0);
}

/** Exact class match first, then nearest by number of matching fields; only passing entries. */
export function pickEntry(entries: TuningEntry[], cls: ImageClass, minMatches = 2): TuningEntry | null {
  const ok = entries.filter((e) => e.passed);
  let best: TuningEntry | null = null, bestM = -1;
  for (const e of ok) {
    const m = classMatch(e.image_class, cls);
    if (m > bestM || (m === bestM && best && e.final_score > best.final_score)) { best = e; bestM = m; }
  }
  return best && bestM >= minMatches ? best : null;
}

export async function findBest(cls: ImageClass): Promise<TuningEntry | null> {
  return pickEntry(await listEntries(), cls);
}
