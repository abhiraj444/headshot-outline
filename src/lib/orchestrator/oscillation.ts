/**
 * Oscillation guard (§9): if a parameter would be pushed back toward a value used in
 * an earlier round, halve the step. If it keeps flipping, freeze it for the rest of the run.
 */
import { flatten, getPath, unflatten } from "../core/params";
import { PARAM_SPECS, type ParamPatch, type Params } from "../core/schema";

export interface GuardAction {
  path: string;
  action: "halved" | "frozen" | "blocked";
  from: unknown;
  proposed: unknown;
  applied?: unknown;
}

export class OscillationGuard {
  /** values a path has held, oldest first (including the current one) */
  private history = new Map<string, unknown[]>();
  /** last direction of numeric moves (+1 / -1) */
  private lastDir = new Map<string, number>();
  private flips = new Map<string, number>();
  readonly frozen = new Set<string>();

  constructor(private maxFlips = 2) {}

  /** Record the parameters used by a round. */
  record(params: Params) {
    for (const [path, v] of Object.entries(flatten(params))) {
      const h = this.history.get(path) ?? [];
      const last = h[h.length - 1];
      if (!h.length || JSON.stringify(last) !== JSON.stringify(v)) h.push(v);
      this.history.set(path, h);
    }
  }

  /** Filter a validated patch against the current params. */
  guard(current: Params, patch: ParamPatch): { patch: ParamPatch; actions: GuardAction[] } {
    const out: Record<string, unknown> = {};
    const actions: GuardAction[] = [];
    for (const [path, proposed] of Object.entries(flatten(patch))) {
      const cur = getPath(current, path);
      if (JSON.stringify(cur) === JSON.stringify(proposed)) continue;
      if (this.frozen.has(path)) {
        actions.push({ path, action: "blocked", from: cur, proposed });
        continue;
      }
      const spec = PARAM_SPECS[path];
      const hist = this.history.get(path) ?? [];
      if (typeof proposed === "number" && typeof cur === "number") {
        const dir = Math.sign(proposed - cur);
        const prevDir = this.lastDir.get(path);
        const earlier = hist.slice(0, -1).filter((v): v is number => typeof v === "number");
        const towardEarlier = earlier.some((e) => Math.sign(e - cur) === dir && e !== cur);
        if (prevDir !== undefined && dir !== 0 && dir === -prevDir && towardEarlier) {
          const n = (this.flips.get(path) ?? 0) + 1;
          this.flips.set(path, n);
          if (n >= this.maxFlips) {
            this.frozen.add(path);
            actions.push({ path, action: "frozen", from: cur, proposed });
            continue;
          }
          let v = cur + (proposed - cur) / 2;
          if (spec && (spec.kind === "int")) v = Math.round(v);
          actions.push({ path, action: "halved", from: cur, proposed, applied: v });
          out[path] = v;
          this.lastDir.set(path, dir);
          continue;
        }
        if (dir !== 0) this.lastDir.set(path, dir);
        out[path] = proposed;
      } else {
        // booleans / enums / sets: returning to an earlier value counts as a flip
        const returning = hist.slice(0, -1).some((v) => JSON.stringify(v) === JSON.stringify(proposed));
        if (returning) {
          const n = (this.flips.get(path) ?? 0) + 1;
          this.flips.set(path, n);
          if (n >= this.maxFlips) {
            this.frozen.add(path);
            actions.push({ path, action: "frozen", from: cur, proposed });
            continue;
          }
        }
        out[path] = proposed;
      }
    }
    return { patch: unflatten(out) as ParamPatch, actions };
  }
}
