"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSettings } from "@/lib/store/settings";
import type { DevicePref } from "@/lib/workers/protocol";
import { Field, SliderField, SwitchField } from "./fields";

const DEVICE_ITEMS: Record<DevicePref, string> = { auto: "Auto (WebGPU if available)", webgpu: "WebGPU", wasm: "WASM (CPU)" };
const SIZE_ITEMS: Record<string, string> = { "640": "640 px (fast, low memory)", "768": "768 px", "1024": "1024 px (default)", "1280": "1280 px (slow)" };

export function LoopPanel() {
  const loop = useSettings((s) => s.loop);
  const setLoop = useSettings((s) => s.setLoop);
  const runtime = useSettings((s) => s.runtime);
  const setRuntime = useSettings((s) => s.setRuntime);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Refinement loop</CardTitle><CardDescription>When to call the AI reviewer and when to stop.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <SliderField label="Pass threshold" value={loop.passThreshold} min={0.5} max={1} step={0.01} onChange={(v) => setLoop({ passThreshold: v })} format={(v) => `${Math.round(v * 100)}%`}
            hint="score = checklist weight × checklist share + metrics weight × metric share" />
          <SliderField label="Max AI rounds" value={loop.maxRounds} min={1} max={10} step={1} onChange={(v) => setLoop({ maxRounds: v })} />
          <SliderField label="Stall after rounds without improvement" value={loop.stallRounds} min={1} max={5} step={1} onChange={(v) => setLoop({ stallRounds: v })} />
          <SliderField label="Checklist weight" value={loop.weights.checklist} min={0} max={1} step={0.05}
            onChange={(v) => setLoop({ weights: { checklist: Math.round(v * 100) / 100, metrics: Math.round((1 - v) * 100) / 100 } })}
            format={(v) => `${v.toFixed(2)} / metrics ${(1 - v).toFixed(2)}`} />
          <SwitchField label="Skip AI when local metrics pass" hint="No API call if every metric is in range." checked={loop.skipAiWhenMetricsPass} onChange={(v) => setLoop({ skipAiWhenMetricsPass: v })} />
          <SwitchField label="Always run the critic once" hint="Safety check even when metrics pass." checked={loop.alwaysCriticOnce} onChange={(v) => setLoop({ alwaysCriticOnce: v })} />
          <SwitchField label="Use tuning memory" hint="Start similar photos from parameters that passed before, and save new passes." checked={loop.useTuningMemory} onChange={(v) => setLoop({ useTuningMemory: v })} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>On-device processing</CardTitle><CardDescription>Models run in a Web Worker with transformers.js.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Inference device">
            <Select value={runtime.device} onValueChange={(v) => v && setRuntime({ device: v as DevicePref })} items={DEVICE_ITEMS}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(DEVICE_ITEMS) as DevicePref[]).map((d) => <SelectItem key={d} value={d}>{DEVICE_ITEMS[d]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Working resolution (long side)" hint="Export is always at the original resolution.">
            <Select value={String(runtime.workingSize)} onValueChange={(v) => v && setRuntime({ workingSize: Number(v) })} items={SIZE_ITEMS}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.keys(SIZE_ITEMS).map((k) => <SelectItem key={k} value={k}>{SIZE_ITEMS[k]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <SwitchField label="MediaPipe landmarks for features" hint="Sharper eyes, brows, lips and nose when the face is within ~50° of frontal. Downloads ~4 MB once." checked={runtime.useLandmarks} onChange={(v) => setRuntime({ useLandmarks: v })} />
        </CardContent>
      </Card>
    </div>
  );
}
