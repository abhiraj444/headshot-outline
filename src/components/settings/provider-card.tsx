"use client";
import { ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, GripVertical, Loader2, PlugZap, RefreshCw, RotateCcw, Trash2, X, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { fetchModels, requestCount, testConnection } from "@/lib/critic/client";
import { presetById } from "@/lib/critic/presets";
import { buildUserText, DEFAULT_SYSTEM_PROMPT } from "@/lib/critic/prompt";
import { buildRequest, parseCustomBody, redactRequest } from "@/lib/critic/request";
import type { ApiFormat, ProviderConfig, ProviderParams } from "@/lib/critic/types";
import { useSettings } from "@/lib/store/settings";
import { cn } from "@/lib/utils";
import { Field, OptionalNumber, SliderField, SwitchField } from "./fields";

const FORMAT_ITEMS: Record<ApiFormat, string> = { openai: "OpenAI-compatible (chat/completions)", gemini: "Gemini (generateContent)", anthropic: "Anthropic (messages)" };
const SAMPLE_IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/";

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border/70">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-11 w-full cursor-pointer items-center justify-between py-2 text-left text-sm font-semibold">
        {title}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && <div className="space-y-4 pb-4">{children}</div>}
    </div>
  );
}

export function ProviderCard({ provider: p, index, count, open, onToggle }: { provider: ProviderConfig; index: number; count: number; open: boolean; onToggle: () => void }) {
  const update = useSettings((s) => s.updateProvider);
  const remove = useSettings((s) => s.removeProvider);
  const move = useSettings((s) => s.moveProvider);
  const algorithm = useSettings((s) => s.algorithm);
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string; sample?: string } | null>(null);
  const [stopText, setStopText] = useState((p.params.stop ?? []).join("\n"));
  const preset = presetById(p.preset);

  const set = (patch: Partial<ProviderConfig>) => update(p.id, patch);
  const setParam = <K extends keyof ProviderParams>(k: K, v: ProviderParams[K]) => {
    const next = { ...p.params };
    if (v === undefined) delete next[k];
    else next[k] = v;
    update(p.id, { params: next });
  };
  const bodyErr = parseCustomBody(p.customBody).error;

  const preview = useMemo(() => {
    try {
      const userText = buildUserText({ params: algorithm, metrics: [], round: 1, featuresEnabled: algorithm.features.enabled });
      return JSON.stringify(redactRequest(buildRequest(p, { systemPrompt: p.systemPrompt, userText: userText.slice(0, 160) + " …", imageDataUrl: SAMPLE_IMAGE }), p.apiKey), null, 2);
    } catch (e) {
      return `Cannot build request: ${(e as Error).message}`;
    }
  }, [p, algorithm]);

  const doFetchModels = async () => {
    setLoadingModels(true);
    try {
      const list = await fetchModels(p);
      setModels(list);
      toast.success(`${list.length} models found`);
    } catch (e) {
      toast.error("Could not fetch models", { description: (e as Error).message });
    } finally {
      setLoadingModels(false);
    }
  };
  const doTest = async () => {
    setTesting(true);
    setTest(null);
    const r = await testConnection(p);
    setTest(r);
    setTesting(false);
  };

  return (
    <Card className={cn(!p.enabled && "opacity-80")}>
      <CardContent className="py-3">
        <div className="flex items-center gap-1">
          <span className="hidden cursor-grab text-muted-foreground sm:inline" aria-hidden><GripVertical className="size-5" /></span>
          <Badge variant="secondary" className="mr-1 tabular-nums" aria-label={`Fallback position ${index + 1}`}>{index + 1}</Badge>
          <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-11 flex-1 cursor-pointer flex-col items-start justify-center rounded-md px-1 text-left">
            <span className="font-semibold">{p.name || "Unnamed provider"}</span>
            <span className="truncate text-xs text-muted-foreground">{p.model || "no model set"} · {p.format}{p.apiKey ? "" : preset.keyRequired ? " · no key" : ""} · {requestCount(p.id)} req</span>
          </button>
          <Switch checked={p.enabled} onCheckedChange={(v) => set({ enabled: v })} aria-label={`${p.enabled ? "Disable" : "Enable"} ${p.name}`} />
          <Button variant="ghost" size="icon" aria-label="Move up" disabled={index === 0} onClick={() => move(p.id, -1)}><ArrowUp /></Button>
          <Button variant="ghost" size="icon" aria-label="Move down" disabled={index === count - 1} onClick={() => move(p.id, 1)}><ArrowDown /></Button>
        </div>

        {open && (
          <div className="mt-3 space-y-1">
            <div className="grid gap-4 pb-4 sm:grid-cols-2">
              <Field label="Name"><Input value={p.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label="API format">
                <Select value={p.format} onValueChange={(v) => v && set({ format: v as ApiFormat })} items={FORMAT_ITEMS}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(FORMAT_ITEMS) as ApiFormat[]).map((f) => <SelectItem key={f} value={f}>{FORMAT_ITEMS[f]}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Base URL" className="sm:col-span-2" hint={preset.note}>
                <Input value={p.baseUrl} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => set({ baseUrl: e.target.value.trim() })} />
              </Field>
              <Field label="API key" className="sm:col-span-2" hint="Stored only in this browser (localStorage).">
                <div className="flex gap-2">
                  <Input type={showKey ? "text" : "password"} value={p.apiKey} autoComplete="off" spellCheck={false} placeholder={preset.keyRequired ? "Paste your key" : "Optional"}
                    onChange={(e) => set({ apiKey: e.target.value.trim() })} />
                  <Button variant="outline" size="icon" aria-label={showKey ? "Hide key" : "Show key"} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff /> : <Eye />}</Button>
                </div>
              </Field>
              <Field label="Model" className="sm:col-span-2" hint="Must be a vision (image-input) model.">
                <div className="flex gap-2">
                  <Input value={p.model} list={`models-${p.id}`} spellCheck={false} autoCapitalize="off" onChange={(e) => set({ model: e.target.value })} />
                  <datalist id={`models-${p.id}`}>{models.map((m) => <option key={m} value={m} />)}</datalist>
                  <Button variant="outline" onClick={doFetchModels} disabled={loadingModels}>
                    {loadingModels ? <Loader2 className="animate-spin" /> : <RefreshCw />} <span className="hidden sm:inline">Fetch models</span><span className="sm:hidden">Fetch</span>
                  </Button>
                </div>
              </Field>
            </div>

            <Section title="Request parameters (optional — empty = not sent)">
              <div className="grid gap-4 sm:grid-cols-3">
                <OptionalNumber label="Temperature" value={p.params.temperature} onChange={(v) => setParam("temperature", v)} min={0} max={2} />
                <OptionalNumber label="Max tokens" value={p.params.max_tokens} onChange={(v) => setParam("max_tokens", v)} min={1} max={200000} integer hint={p.format === "anthropic" ? "Anthropic requires it; 1024 is used when empty." : undefined} />
                <OptionalNumber label="Top p" value={p.params.top_p} onChange={(v) => setParam("top_p", v)} min={0} max={1} />
                <OptionalNumber label="Top k" value={p.params.top_k} onChange={(v) => setParam("top_k", v)} min={1} max={1000} integer />
                <OptionalNumber label="Frequency penalty" value={p.params.frequency_penalty} onChange={(v) => setParam("frequency_penalty", v)} min={-2} max={2} />
                <OptionalNumber label="Presence penalty" value={p.params.presence_penalty} onChange={(v) => setParam("presence_penalty", v)} min={-2} max={2} />
                <OptionalNumber label="Seed" value={p.params.seed} onChange={(v) => setParam("seed", v)} integer />
              </div>
              <Field label="Stop sequences" hint="One per line. Empty = not sent.">
                <Textarea rows={2} value={stopText} onChange={(e) => setStopText(e.target.value)}
                  onBlur={() => { const list = stopText.split("\n").map((x) => x.trim()).filter(Boolean); setParam("stop", list.length ? list : undefined); }} />
              </Field>
              <SwitchField label="JSON mode" hint={p.format === "openai" ? "Sends response_format: json_object (not every model supports it)." : p.format === "gemini" ? "Sends responseMimeType: application/json." : "Prefills the reply with “{”."}
                checked={!!p.params.json_mode} onChange={(v) => setParam("json_mode", v ? true : undefined)} />
            </Section>

            <Section title="Timeout and retries">
              <div className="grid gap-4 sm:grid-cols-3">
                <OptionalNumber label="Timeout (ms)" value={p.params.timeout_ms} onChange={(v) => setParam("timeout_ms", v)} min={1000} max={600000} integer hint="Default 45000" />
                <OptionalNumber label="Retries (429 / timeout)" value={p.params.retries} onChange={(v) => setParam("retries", v)} min={0} max={5} integer hint="Default 1" />
                <OptionalNumber label="Backoff (ms)" value={p.params.backoff_ms} onChange={(v) => setParam("backoff_ms", v)} min={0} max={120000} integer hint="Default 2000" />
              </div>
            </Section>

            <Section title="Advanced: headers, custom body, prompt, image">
              <Field label="Custom headers">
                <div className="space-y-2">
                  {p.headers.map((h, i) => (
                    <div key={i} className="flex gap-2">
                      <Input aria-label="Header name" placeholder="Header" value={h.key} onChange={(e) => set({ headers: p.headers.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })} />
                      <Input aria-label="Header value" placeholder="Value" value={h.value} onChange={(e) => set({ headers: p.headers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                      <Button variant="ghost" size="icon" aria-label="Remove header" onClick={() => set({ headers: p.headers.filter((_, j) => j !== i) })}><X /></Button>
                    </div>
                  ))}
                  <Button variant="outline" onClick={() => set({ headers: [...p.headers, { key: "", value: "" }] })}><Plus aria-hidden /> Add header</Button>
                </div>
              </Field>
              <Field label="Custom request body JSON" hint="Deep-merged LAST — overrides anything above.">
                <Textarea rows={4} className="font-mono text-xs" spellCheck={false} placeholder='{"provider": {"sort": "latency"}}' value={p.customBody}
                  aria-invalid={!!bodyErr} onChange={(e) => set({ customBody: e.target.value })} />
                {bodyErr && <p className="text-xs text-destructive">Invalid JSON: {bodyErr} (ignored until fixed)</p>}
              </Field>
              <Field label="System prompt">
                <Textarea rows={6} className="text-xs" value={p.systemPrompt} onChange={(e) => set({ systemPrompt: e.target.value })} />
                <Button variant="ghost" onClick={() => set({ systemPrompt: DEFAULT_SYSTEM_PROMPT })}><RotateCcw aria-hidden /> Reset to default</Button>
              </Field>
              <SliderField label="Review image max width" value={p.imageMaxWidth} min={256} max={2048} step={64} onChange={(v) => set({ imageMaxWidth: v })} format={(v) => `${v}px`} hint="Combined width of the side-by-side review image." />
              <SliderField label="Review image JPEG quality" value={p.jpegQuality} min={0.3} max={1} step={0.05} onChange={(v) => set({ jpegQuality: v })} format={(v) => v.toFixed(2)} />
            </Section>

            <Section title="Request preview (exactly what will be sent)">
              <p className="text-xs text-muted-foreground">Live with the current settings. Key redacted, image data and prompt shortened for display.</p>
              <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-relaxed"><code>{preview}</code></pre>
            </Section>

            <Separator />
            <div className="flex flex-wrap items-center gap-2 pt-3">
              <Button onClick={doTest} disabled={testing}>{testing ? <Loader2 className="animate-spin" /> : <PlugZap />} Test connection</Button>
              <Button variant="ghost" className="text-destructive" onClick={() => { if (confirm(`Remove ${p.name}?`)) remove(p.id); }}><Trash2 aria-hidden /> Remove</Button>
            </div>
            {test && (
              <div role="status" className={cn("mt-2 rounded-lg px-3 py-2 text-sm", test.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                {test.message}
                {test.sample && <div className="mt-1 font-mono text-xs text-muted-foreground">Reply: {test.sample}</div>}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
