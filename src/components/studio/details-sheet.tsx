"use client";
import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CHECKLIST_GOOD, CHECKLIST_KEYS, type ChecklistKey } from "@/lib/core/schema";
import type { LoopOutcome, RoundRecord } from "@/lib/orchestrator/loop";
import type { RunOutput } from "@/lib/pipeline/run";
import type { SegmentResult } from "@/lib/workers/protocol";
import { allRequestCounts } from "@/lib/critic/client";
import { useEffect, useState } from "react";

const fmt = (v: unknown) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : JSON.stringify(v));

function PassIcon({ pass }: { pass: boolean | null }) {
  if (pass === null) return <CircleDashed className="size-4 text-muted-foreground" aria-label="informational" />;
  return pass ? <CheckCircle2 className="size-4 text-success" aria-label="pass" /> : <XCircle className="size-4 text-destructive" aria-label="fail" />;
}

function cutoutUrl(r: RunOutput): string {
  const c = document.createElement("canvas");
  c.width = r.w; c.height = r.h;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(r.cutout), r.w, r.h), 0, 0);
  return c.toDataURL("image/png");
}

export function DetailsSheet({ open, onOpenChange, result, rounds, outcome, seg }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  result: RunOutput | null;
  rounds: RoundRecord[];
  outcome: LoopOutcome | null;
  seg: SegmentResult | null;
}) {
  const [cut, setCut] = useState<string | null>(null);
  useEffect(() => { if (open && result) setCut(cutoutUrl(result)); }, [open, result]);
  const reviewed = rounds.filter((r) => r.reviewed);
  const counts = allRequestCounts();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Details</SheetTitle>
          <SheetDescription>What the local checks measured and what the AI reviewer changed.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <Accordion multiple defaultValue={["status", "metrics"]}>
            <AccordionItem value="status">
              <AccordionTrigger className="min-h-11">Status</AccordionTrigger>
              <AccordionContent>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">Result</dt><dd>{outcome ? `${outcome.terminal.replace("_", " ")} — ${outcome.message}` : "In progress"}</dd>
                  <dt className="text-muted-foreground">AI review</dt><dd>{outcome ? (outcome.criticUsed ? `${reviewed.length} round(s) via ${reviewed[reviewed.length - 1]?.provider ?? "provider"}` : "Not used (metrics only)") : "—"}</dd>
                  <dt className="text-muted-foreground">Requests</dt><dd>{Object.keys(counts).length ? `${Object.values(counts).reduce((a, b) => a + b, 0)} this session` : "0 this session"}</dd>
                  <dt className="text-muted-foreground">Device</dt><dd>{seg ? `${seg.device.toUpperCase()} · matte: ${seg.matteModel ?? "none"} · parsing: ${seg.parsingOk ? "ok" : "unavailable"}` : "—"}</dd>
                  {result && <><dt className="text-muted-foreground">Pose</dt><dd>{result.geom?.pose ?? "unknown"} · {result.imageClass.hair} hair · {result.imageClass.accessories}</dd></>}
                  {result && <><dt className="text-muted-foreground">Run</dt><dd>{result.ms} ms · cache {result.cache.hits} hits / {result.cache.misses} misses{result.featureStats?.usedLandmarks ? " · landmarks" : ""}</dd></>}
                </dl>
                {[...(seg?.warnings ?? []), ...(result?.warnings ?? [])].map((w, i) => (
                  <p key={i} className="mt-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{w}</p>
                ))}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="metrics">
              <AccordionTrigger className="min-h-11">Local metrics</AccordionTrigger>
              <AccordionContent>
                {result ? (
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-medium">Metric</th><th className="font-medium">Value</th><th className="font-medium">Expected</th><th className="sr-only">Pass</th></tr></thead>
                    <tbody>
                      {result.metrics.map((m) => (
                        <tr key={m.key} className="border-t border-border/60">
                          <td className="py-1.5 pr-2">{m.label}</td>
                          <td className="font-mono text-xs">{m.value === null ? "n/a" : fmt(m.value)}</td>
                          <td className="text-xs text-muted-foreground">{m.expected}</td>
                          <td><PassIcon pass={m.pass} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="text-sm text-muted-foreground">No result yet.</p>}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="checklist">
              <AccordionTrigger className="min-h-11">AI checklist</AccordionTrigger>
              <AccordionContent>
                {reviewed.length ? reviewed.map((r) => (
                  <div key={r.index} className="mb-3">
                    <div className="mb-1 text-xs font-semibold">{r.label} · {Math.round(r.score * 100)}% · {r.provider}</div>
                    <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                      {CHECKLIST_KEYS.filter((k) => r.checklist && k in r.checklist).map((k) => {
                        const v = r.checklist![k as ChecklistKey];
                        return (
                          <li key={k} className="flex items-center gap-2">
                            <PassIcon pass={CHECKLIST_GOOD[k](v)} />
                            <span>{k.replaceAll("_", " ")}: <span className="text-muted-foreground">{String(v)}</span></span>
                          </li>
                        );
                      })}
                    </ul>
                    {!!r.issues?.length && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.issues.map((i, n) => <Badge key={n} variant="secondary">{i.type.replaceAll("_", " ")} · {i.region} · s{i.severity}</Badge>)}
                      </div>
                    )}
                  </div>
                )) : <p className="text-sm text-muted-foreground">The AI reviewer was not used for this photo.</p>}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="patches">
              <AccordionTrigger className="min-h-11">Parameter changes per round</AccordionTrigger>
              <AccordionContent>
                {rounds.some((r) => r.diff?.length || r.guardActions?.length || r.validation) ? rounds.map((r) => (r.diff?.length || r.guardActions?.length || r.validation) ? (
                  <div key={r.index} className="mb-3 text-sm">
                    <div className="mb-1 text-xs font-semibold">After {r.label}</div>
                    <ul className="space-y-0.5 font-mono text-xs">
                      {(r.diff ?? []).map((d) => <li key={d.path}>{d.path}: <span className="text-destructive line-through">{fmt(d.from)}</span> → <span className="text-success">{fmt(d.to)}</span></li>)}
                    </ul>
                    {(r.guardActions ?? []).map((g, i) => <p key={i} className="text-xs text-warning">Oscillation guard: {g.path} {g.action}</p>)}
                    {r.validation && (r.validation.clamped.length > 0 || r.validation.dropped.length > 0 || r.validation.ignored.length > 0) && (
                      <p className="text-xs text-muted-foreground">
                        Validator: {r.validation.clamped.length} clamped, {r.validation.dropped.length} dropped, {r.validation.ignored.length} ignored
                      </p>
                    )}
                  </div>
                ) : null) : <p className="text-sm text-muted-foreground">No parameter changes were applied.</p>}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="cutout">
              <AccordionTrigger className="min-h-11">Head cut-out (edge-decontaminated preview)</AccordionTrigger>
              <AccordionContent>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {cut ? <img src={cut} alt="Head cut-out preview" className="checkerboard w-full rounded-lg" /> : <p className="text-sm text-muted-foreground">No result yet.</p>}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </SheetContent>
    </Sheet>
  );
}
