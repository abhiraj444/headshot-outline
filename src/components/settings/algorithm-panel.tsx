"use client";
import { RotateCcw, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { clone, getPath, unflatten, deepMerge } from "@/lib/core/params";
import { DEFAULT_PARAMS, PARAM_SPECS, type Params } from "@/lib/core/schema";
import { validateParams } from "@/lib/core/validator";
import { useSettings } from "@/lib/store/settings";
import { cn } from "@/lib/utils";
import { Field, SliderField, SwitchField } from "./fields";

const SECTIONS: { key: string; title: string; desc: string }[] = [
  { key: "matte", title: "Person matte", desc: "Separates the person from the background." },
  { key: "parsing", title: "Face parsing", desc: "Decides which head regions are kept. Neck and clothing are never kept." },
  { key: "combine", title: "Combine", desc: "Grows the kept region; the matte supplies fine edges." },
  { key: "neck_cut", title: "Neck cut", desc: "Soft cut perpendicular to the head axis, just below the chin." },
  { key: "cleanup", title: "Cleanup", desc: "Largest region, hole filling, guided-filter edges." },
  { key: "outline", title: "Outline", desc: "Smoothing, simplification and stroke." },
  { key: "features", title: "Facial features", desc: "Internal line art traced from face parsing." },
  { key: "fallback", title: "Fallback", desc: "Classical GrabCut-lite with a skin-colour prior." },
];

export function AlgorithmPanel() {
  const algorithm = useSettings((s) => s.algorithm);
  const setAlgorithm = useSettings((s) => s.setAlgorithm);
  const [json, setJson] = useState(() => JSON.stringify(algorithm, null, 2));
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  useEffect(() => { setJson(JSON.stringify(algorithm, null, 2)); }, [algorithm]);

  const setPath = (path: string, value: unknown) => setAlgorithm(deepMerge(clone(algorithm), unflatten({ [path]: value })) as Params);

  const applyJson = () => {
    try {
      const raw = JSON.parse(json);
      const { params, report } = validateParams(raw);
      setAlgorithm(params);
      setJsonErr(null);
      const n = report.clamped.length + report.dropped.length + report.ignored.length;
      toast.success("Algorithm defaults updated", { description: n ? `${report.clamped.length} clamped, ${report.dropped.length} unknown dropped, ${report.ignored.length} wrong-type ignored` : undefined });
    } catch (e) {
      setJsonErr((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Starting parameters for every photo (§5 schema). Sliders are bounded by the validator ranges; the AI may only change fields marked “AI”.</p>
        <Button variant="outline" onClick={() => { setAlgorithm(clone(DEFAULT_PARAMS)); toast.success("Reset to defaults"); }}><RotateCcw aria-hidden /> Reset defaults</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((sec) => (
          <Card key={sec.key}>
            <CardHeader><CardTitle className="text-base">{sec.title}</CardTitle><CardDescription>{sec.desc}</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(PARAM_SPECS).filter(([p]) => p.startsWith(sec.key + ".")).map(([path, spec]) => {
                const v = getPath(algorithm, path);
                const label = <>{spec.label}{spec.ai && <span className="ml-1.5 rounded bg-accent px-1 py-0.5 text-[10px] font-semibold text-accent-foreground">AI</span>}</>;
                if (spec.kind === "number" || spec.kind === "int") {
                  return <SliderField key={path} label={spec.label + (spec.ai ? " · AI" : "")} value={Number(v)} min={spec.min} max={spec.max} step={spec.step} onChange={(n) => setPath(path, n)}
                    format={(n) => (spec.kind === "int" ? String(n) : n.toFixed(spec.step < 0.001 ? 4 : spec.step < 0.01 ? 3 : 2))} />;
                }
                if (spec.kind === "boolean") return <SwitchField key={path} label={spec.label + (spec.ai ? " · AI" : "")} checked={!!v} onChange={(b) => setPath(path, b)} />;
                if (spec.kind === "enum") {
                  const items = Object.fromEntries(spec.values.map((x) => [x, x]));
                  return (
                    <Field key={path} label={spec.label + (spec.ai ? " · AI" : "")}>
                      <Select value={String(v)} onValueChange={(x) => x && setPath(path, x)} items={items}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{spec.values.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                      </Select>
                    </Field>
                  );
                }
                const set = new Set((v as string[]) ?? []);
                return (
                  <fieldset key={path} className="space-y-1.5">
                    <legend className="text-sm font-medium">{label}</legend>
                    <div className="flex flex-wrap gap-2">
                      {spec.values.map((x) => {
                        const on = set.has(x);
                        return (
                          <button key={x} type="button" aria-pressed={on}
                            onClick={() => { const n = new Set(set); if (on) n.delete(x); else n.add(x); setPath(path, spec.values.filter((y) => n.has(y))); }}
                            className={cn("inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full border px-3 text-sm", on ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground")}>
                            {on && <Check className="size-3.5" aria-hidden />}{x}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Raw JSON</CardTitle><CardDescription>Edited JSON is validated: unknown keys dropped, numbers clamped, wrong types ignored.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <Textarea rows={16} className="font-mono text-xs" spellCheck={false} value={json} aria-invalid={!!jsonErr} onChange={(e) => setJson(e.target.value)} aria-label="Algorithm parameters JSON" />
          {jsonErr && <p className="text-xs text-destructive">Invalid JSON: {jsonErr}</p>}
          <Button onClick={applyJson}><Check aria-hidden /> Validate and apply</Button>
        </CardContent>
      </Card>
    </div>
  );
}
