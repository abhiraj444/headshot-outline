"use client";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Brush, Download, FileCode2, ImagePlus, Info, Loader2, Minus, Plus, RotateCcw, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHydrated } from "@/hooks/use-hydrated";
import { useSettings } from "@/lib/store/settings";
import { buildPng, buildSvg, download, type ExportInput } from "@/lib/ui/export";
import { ConfidenceRing } from "./confidence-ring";
import { DetailToggle } from "./detail-toggle";
import { DetailsSheet } from "./details-sheet";
import { DropZone } from "./drop-zone";
import { Filmstrip } from "./filmstrip";
import { OutlineView, type NudgeMode } from "./outline-view";
import { PrivacyDialog } from "./privacy-dialog";
import { Stepper } from "./stepper";
import { useStudio } from "./use-studio";

export function Studio() {
  const hydrated = useHydrated();
  const s = useStudio();
  const detail = useSettings((st) => st.studioDetail);
  const setDetail = useSettings((st) => st.setStudioDetail);
  const providers = useSettings((st) => st.providers);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [nudgeMode, setNudgeMode] = useState<NudgeMode>(null);
  const start = s.start;

  // paste an image anywhere
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/"));
      if (f) { e.preventDefault(); setNudgeMode(null); start(f, "pasted"); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [start]);

  const working = s.phase === "loading_models" || s.phase === "processing" || s.phase === "refining";
  const finished = s.phase === "done" || s.phase === "done_best_effort";
  const shown = s.shown;
  const score = useMemo(() => {
    if (s.hasOverride && shown) return { v: shown.result.metricScore, label: "Your edit (metrics)", tone: shown.result.metricsPass ? "pass" : "warn" } as const;
    if (!s.outcome) return null;
    const b = s.outcome.best;
    const label = s.outcome.terminal === "PASS" ? (b.reviewed ? "Passed" : "Passed (metrics only)") : s.outcome.terminal === "METRICS_ONLY" ? "Metrics only" : "Best effort";
    return { v: b.score, label, tone: s.outcome.terminal === "PASS" || (s.outcome.terminal === "METRICS_ONLY" && b.result.metricsPass) ? "pass" : "warn" } as const;
  }, [s.outcome, s.hasOverride, shown]);

  const exportInput = (): ExportInput | null => {
    if (!shown || !s.image) return null;
    return {
      outline: shown.result.outline, features: shown.result.features,
      workW: shown.result.w, workH: shown.result.h, origW: s.image.origW, origH: s.image.origH,
      strokePx: shown.params.outline.stroke_px, strokeRatio: shown.params.features.stroke_ratio,
    };
  };
  const baseName = (s.image?.name ?? "headshot").replace(/\.[a-z0-9]+$/i, "") + "-outline";
  const doExport = async (kind: "png-white" | "png-transparent" | "svg") => {
    const e = exportInput();
    if (!e) return;
    try {
      if (kind === "svg") download(new Blob([buildSvg(e)], { type: "image/svg+xml" }), `${baseName}.svg`);
      else download(await buildPng(e, kind === "png-white" ? "white" : "transparent"), `${baseName}${kind === "png-transparent" ? "-transparent" : ""}.png`);
      setExportOpen(false);
      toast.success(`Saved ${kind === "svg" ? "SVG" : "PNG"} at ${e.origW}×${e.origH}`);
    } catch (err) {
      toast.error("Export failed", { description: (err as Error).message });
    }
  };

  const onFile = (f: File) => { setNudgeMode(null); s.start(f, f.name || "photo"); };

  if (!hydrated) return <div className="min-h-[52dvh] animate-pulse rounded-2xl bg-muted" aria-busy="true" aria-label="Loading" />;

  return (
    <div className="space-y-5">
      <PrivacyDialog open={s.consentOpen} providers={providers.filter((p) => p.enabled).map((p) => p.name)} onAnswer={s.resolveConsent} />

      {s.phase === "idle" && (
        <>
          <DropZone onFile={onFile} />
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm text-muted-foreground" id="detail-label">Detail</span>
            <DetailToggle value={detail} onChange={setDetail} />
          </div>
        </>
      )}

      {s.phase !== "idle" && s.image && (
        <>
          <div className="space-y-3">
            <Stepper step={s.step} error={s.phase === "error"} />
            <div className="flex min-h-14 items-center gap-3" aria-live="polite" aria-busy={working}>
              {score && finished ? (
                <ConfidenceRing value={score.v} label={score.label} tone={score.tone} />
              ) : working ? (
                <Loader2 className="size-6 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
              ) : null}
              <p className="text-sm">
                <span className="font-medium capitalize">{s.phase === "refining" ? `Round ${Math.max(1, s.rounds.length)}: ` : ""}</span>
                {s.caption ? s.caption.charAt(0).toUpperCase() + s.caption.slice(1) : ""}
                {s.busyLocal && " · updating…"}
              </p>
            </div>
            {s.phase === "loading_models" && s.progress && s.progress.pct < 1 && (
              <div className="space-y-1">
                <Progress value={Math.round(s.progress.pct * 100)} aria-label="Model download" />
                <p className="text-xs text-muted-foreground">
                  {s.progress.status} · {Math.round(s.progress.pct * 100)}% · first run only, then cached on this device
                </p>
              </div>
            )}
          </div>

          {s.phase === "error" && (
            <Card className="border-destructive/50" role="alert">
              <CardContent className="flex items-start gap-3 py-4">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
                <div className="space-y-3">
                  <p className="text-sm">{s.error}</p>
                  <Button variant="outline" onClick={s.reset}><ImagePlus aria-hidden /> Try another photo</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {s.phase === "done_best_effort" && !nudgeMode && (
            <Card className="border-warning/50" role="status">
              <CardContent className="flex items-start gap-3 py-4">
                <Info className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
                <div className="space-y-2 text-sm">
                  <p><strong>This is the best result I could get.</strong> {s.outcome?.message}</p>
                  <p className="text-muted-foreground">
                    If something is off, tap <em>Fix</em> and paint over what to include or remove.
                    {!providers.some((p) => p.enabled) && <> You can also <Link href="/settings" className="font-medium text-primary underline underline-offset-4">add an AI provider</Link> for automatic refinement.</>}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <OutlineView
            imageUrl={s.image.url}
            w={s.image.w}
            h={s.image.h}
            result={shown?.result ?? null}
            strokePx={shown?.params.outline.stroke_px ?? 4}
            strokeRatio={shown?.params.features.stroke_ratio ?? 0.6}
            drawKey={s.drawKey}
            working={working}
            nudgeMode={nudgeMode}
            nudges={s.nudges}
            onNudge={(n) => { const next = s.addNudge(n); s.rerunLocal(next); }}
          />

          <AnimatePresence mode="wait">
            {nudgeMode ? (
              <motion.div key="nudge" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
                <p className="text-center text-sm text-muted-foreground">Tap or drag on the photo. Highlighted = inside the outline.</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <div role="radiogroup" aria-label="Brush" className="inline-flex rounded-xl bg-muted p-1">
                    <button type="button" role="radio" aria-checked={nudgeMode === "include"} onClick={() => setNudgeMode("include")}
                      className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-4 text-sm font-medium ${nudgeMode === "include" ? "bg-background text-success shadow-sm" : "text-muted-foreground"}`}>
                      <Plus className="size-4" aria-hidden /> Include this
                    </button>
                    <button type="button" role="radio" aria-checked={nudgeMode === "exclude"} onClick={() => setNudgeMode("exclude")}
                      className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-4 text-sm font-medium ${nudgeMode === "exclude" ? "bg-background text-destructive shadow-sm" : "text-muted-foreground"}`}>
                      <Minus className="size-4" aria-hidden /> Not this
                    </button>
                  </div>
                  <Button variant="outline" size="icon" aria-label="Undo last stroke" disabled={!s.nudges.length || s.busyLocal}
                    onClick={() => { const next = s.nudges.slice(0, -1); s.setNudges(next); s.rerunLocal(next); }}>
                    <Undo2 />
                  </Button>
                  <Button variant="outline" size="icon" aria-label="Clear all strokes" disabled={!s.nudges.length || s.busyLocal}
                    onClick={() => { s.setNudges([]); s.rerunLocal([]); }}>
                    <RotateCcw />
                  </Button>
                  <Button onClick={() => setNudgeMode(null)}><X aria-hidden /> Done</Button>
                </div>
              </motion.div>
            ) : finished ? (
              <motion.div key="actions" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="flex justify-center">
                  <DetailToggle value={detail} disabled={s.busyLocal} onChange={(d) => { setDetail(d); s.rerunLocal(s.nudges, d); }} />
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button size="lg" onClick={() => doExport("png-white")} className="min-w-44"><Download aria-hidden /> Download PNG</Button>
                  <Button size="lg" variant="outline" onClick={() => setExportOpen(true)}><FileCode2 aria-hidden /> More formats</Button>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-1">
                  <Button variant="ghost" onClick={() => setNudgeMode("include")}><Brush aria-hidden /> Fix</Button>
                  <Button variant="ghost" onClick={() => setDetailsOpen(true)}><Info aria-hidden /> Details</Button>
                  <Button variant="ghost" onClick={() => { setNudgeMode(null); s.reset(); }}><ImagePlus aria-hidden /> New photo</Button>
                </div>
              </motion.div>
            ) : working ? (
              <motion.div key="working" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-center gap-2">
                <Button variant="ghost" onClick={() => setDetailsOpen(true)} disabled={!s.rounds.length}><Info aria-hidden /> Details</Button>
                <Button variant="ghost" onClick={s.reset}><X aria-hidden /> Cancel</Button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {s.image && (
            <Filmstrip rounds={s.rounds} selected={s.hasOverride ? null : s.selected} onSelect={s.setSelected} imageUrl={s.image.url} bestIndex={s.outcome?.best.index ?? null} />
          )}
        </>
      )}

      <DetailsSheet open={detailsOpen} onOpenChange={setDetailsOpen} result={shown?.result ?? null} rounds={s.rounds} outcome={s.outcome} seg={s.seg} />

      <Sheet open={exportOpen} onOpenChange={setExportOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>Export</SheetTitle>
            <SheetDescription>
              Full original resolution{s.image ? ` (${s.image.origW}×${s.image.origH})` : ""}. Black lines; SVG keeps the outline and features in separate groups.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-2 px-4">
            <Button size="lg" onClick={() => doExport("png-white")}><Download aria-hidden /> PNG · white background</Button>
            <Button size="lg" variant="outline" onClick={() => doExport("png-transparent")}><Download aria-hidden /> PNG · transparent</Button>
            <Button size="lg" variant="outline" onClick={() => doExport("svg")}><FileCode2 aria-hidden /> SVG · vector</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
