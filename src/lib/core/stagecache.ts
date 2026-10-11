import { hashString, stableStringify } from "./params";

/**
 * StageCache (tech doc §3, §15): each stage's output is keyed by a hash of
 * (upstream key + this stage's parameter slice), so changing a late-stage
 * parameter does not rerun earlier stages.
 */
export class StageCache {
  private store = new Map<string, unknown>();
  private order: string[] = [];
  hits = 0;
  misses = 0;
  constructor(private maxEntries = 24) {}

  static key(stage: string, upstream: string, slice: unknown): string {
    return `${stage}:${hashString(upstream + "|" + stableStringify(slice))}`;
  }

  async get<T>(key: string, compute: () => T | Promise<T>): Promise<T> {
    if (this.store.has(key)) {
      this.hits++;
      return this.store.get(key) as T;
    }
    this.misses++;
    const v = await compute();
    this.store.set(key, v);
    this.order.push(key);
    while (this.order.length > this.maxEntries) this.store.delete(this.order.shift()!);
    return v;
  }

  has(key: string) {
    return this.store.has(key);
  }

  clear() {
    this.store.clear();
    this.order = [];
    this.hits = 0;
    this.misses = 0;
  }
}
