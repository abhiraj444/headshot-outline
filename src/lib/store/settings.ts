"use client";
/**
 * One Zustand store, persisted to localStorage. Every setting here is read at call time
 * by the orchestrator / worker / critic client (see useSettings.getState() usages).
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_PARAMS, SCHEMA_VERSION, type Params } from "../core/schema";
import { clone, deepMerge, isPlainObject } from "../core/params";
import { validateParams } from "../core/validator";
import { DEFAULT_SYSTEM_PROMPT } from "../critic/prompt";
import { presetById } from "../critic/presets";
import type { ProviderConfig } from "../critic/types";
import type { DevicePref } from "../workers/protocol";

export interface LoopSettings {
  passThreshold: number;
  maxRounds: number;
  skipAiWhenMetricsPass: boolean;
  alwaysCriticOnce: boolean;
  weights: { checklist: number; metrics: number };
  stallRounds: number;
  useTuningMemory: boolean;
}

export interface RuntimeSettings {
  device: DevicePref;
  useLandmarks: boolean;
  workingSize: number;
}

export type StudioDetail = "outline" | "features" | "detailed";

export interface SettingsState {
  version: number;
  providers: ProviderConfig[];
  loop: LoopSettings;
  algorithm: Params;
  runtime: RuntimeSettings;
  studioDetail: StudioDetail;
  privacyAccepted: boolean;
  // actions
  addProvider: (presetId: string) => string;
  updateProvider: (id: string, patch: Partial<ProviderConfig>) => void;
  removeProvider: (id: string) => void;
  moveProvider: (id: string, delta: number) => void;
  reorderProviders: (fromId: string, toId: string) => void;
  setLoop: (patch: Partial<LoopSettings>) => void;
  setAlgorithm: (p: Params) => void;
  setRuntime: (patch: Partial<RuntimeSettings>) => void;
  setStudioDetail: (d: StudioDetail) => void;
  setPrivacyAccepted: (v: boolean) => void;
  resetAll: () => void;
  importSettings: (json: unknown) => { ok: boolean; message: string };
}

export const DEFAULT_LOOP: LoopSettings = {
  passThreshold: 0.95,
  maxRounds: 4,
  skipAiWhenMetricsPass: true,
  alwaysCriticOnce: false,
  weights: { checklist: 0.6, metrics: 0.4 },
  stallRounds: 2,
  useTuningMemory: true,
};

export const DEFAULT_RUNTIME: RuntimeSettings = { device: "auto", useLandmarks: true, workingSize: 1024 };

const uid = () => Math.random().toString(36).slice(2, 10);

export function newProvider(presetId: string): ProviderConfig {
  const pr = presetById(presetId);
  return {
    id: uid(),
    name: pr.name,
    preset: pr.id,
    format: pr.format,
    baseUrl: pr.baseUrl,
    apiKey: "",
    model: pr.model,
    enabled: true,
    params: { json_mode: pr.format !== "anthropic" ? true : undefined, temperature: 0.1 },
    customBody: "",
    headers: pr.headers ? clone(pr.headers) : [],
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    imageMaxWidth: 1024,
    jpegQuality: 0.8,
  };
}

const initial = () => ({
  version: 1,
  providers: [] as ProviderConfig[],
  loop: clone(DEFAULT_LOOP),
  algorithm: clone(DEFAULT_PARAMS),
  runtime: clone(DEFAULT_RUNTIME),
  studioDetail: "features" as StudioDetail,
  privacyAccepted: false,
});

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...initial(),
      addProvider: (presetId) => {
        const p = newProvider(presetId);
        set({ providers: [...get().providers, p] });
        return p.id;
      },
      updateProvider: (id, patch) =>
        set({ providers: get().providers.map((p) => (p.id === id ? { ...p, ...patch, params: patch.params ? patch.params : p.params } : p)) }),
      removeProvider: (id) => set({ providers: get().providers.filter((p) => p.id !== id) }),
      moveProvider: (id, delta) => {
        const list = get().providers.slice();
        const i = list.findIndex((p) => p.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        set({ providers: list });
      },
      reorderProviders: (fromId, toId) => {
        const list = get().providers.slice();
        const i = list.findIndex((p) => p.id === fromId);
        const j = list.findIndex((p) => p.id === toId);
        if (i < 0 || j < 0 || i === j) return;
        const [item] = list.splice(i, 1);
        list.splice(j, 0, item);
        set({ providers: list });
      },
      setLoop: (patch) => set({ loop: { ...get().loop, ...patch } }),
      setAlgorithm: (p) => set({ algorithm: validateParams(p).params }),
      setRuntime: (patch) => set({ runtime: { ...get().runtime, ...patch } }),
      setStudioDetail: (d) => set({ studioDetail: d }),
      setPrivacyAccepted: (v) => set({ privacyAccepted: v }),
      resetAll: () => set(initial()),
      importSettings: (json) => {
        if (!isPlainObject(json)) return { ok: false, message: "Not a settings object" };
        const cur = get();
        const next: Partial<SettingsState> = {};
        if (Array.isArray(json.providers)) {
          next.providers = (json.providers as Partial<ProviderConfig>[]).map((p) => {
            const base = newProvider(typeof p.preset === "string" ? p.preset : "custom");
            const merged = deepMerge(base, p) as ProviderConfig;
            // keep an existing key if the import excluded keys
            const existing = cur.providers.find((x) => x.id === merged.id || (x.name === merged.name && x.baseUrl === merged.baseUrl));
            if (!merged.apiKey && existing?.apiKey) merged.apiKey = existing.apiKey;
            return merged;
          });
        }
        if (isPlainObject(json.loop)) next.loop = deepMerge(clone(DEFAULT_LOOP), json.loop);
        if (isPlainObject(json.algorithm)) next.algorithm = validateParams(json.algorithm).params;
        if (isPlainObject(json.runtime)) next.runtime = deepMerge(clone(DEFAULT_RUNTIME), json.runtime);
        if (typeof json.studioDetail === "string" && ["outline", "features", "detailed"].includes(json.studioDetail)) next.studioDetail = json.studioDetail as StudioDetail;
        set(next);
        return { ok: true, message: `Imported ${Object.keys(next).join(", ") || "nothing"}` };
      },
    }),
    {
      name: "headshot-outline-settings",
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        version: s.version,
        providers: s.providers,
        loop: s.loop,
        algorithm: s.algorithm,
        runtime: s.runtime,
        studioDetail: s.studioDetail,
        privacyAccepted: s.privacyAccepted,
      }),
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        // older schema versions: re-validate params so new sections (features) get defaults
        return { ...p, algorithm: validateParams(p.algorithm ?? {}).params } as SettingsState;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
          loop: deepMerge(clone(DEFAULT_LOOP), p.loop ?? {}),
          runtime: deepMerge(clone(DEFAULT_RUNTIME), p.runtime ?? {}),
          algorithm: validateParams(p.algorithm ?? {}).params,
        };
      },
    },
  ),
);

export function exportSettings(includeKeys: boolean) {
  const s = useSettings.getState();
  return {
    app: "headshot-outline",
    exported_at: new Date().toISOString(),
    providers: s.providers.map((p) => (includeKeys ? p : { ...p, apiKey: "" })),
    loop: s.loop,
    algorithm: s.algorithm,
    runtime: s.runtime,
    studioDetail: s.studioDetail,
  };
}
