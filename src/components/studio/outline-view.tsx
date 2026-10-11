"use client";
/**
 * Result stage: before/after slider (photo ↔ line art), live self-drawing SVG
 * (outline first, then features), and tap-to-nudge include/exclude brush.
 */
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { polylineToPath } from "@/lib/pipeline/outline";
import type { RunOutput } from "@/lib/pipeline/run";
import type { Nudge } from "@/lib/pipeline/combine";
import { useReducedMotionPref } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

export type NudgeMode = "include" | "exclude" | null;

function cutoutUrl(r: RunOutput | null): string | null {
  if (!r || typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = r.w;
  c.height = r.h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(r.cutout), r.w, r.h), 0, 0);
  return c.toDataURL("image/png");
}

export function OutlineView(props: {
  imageUrl: string;
  w: number;
  h: number;
  result: RunOutput | null;
  strokePx: number;
  strokeRatio: number;
  drawKey: number;
  working: boolean;
  nudgeMode: NudgeMode;
  nudges: Nudge[];
  onNudge: (n: Nudge) => void;
}) {
  const { imageUrl, w, h, result, strokePx, strokeRatio, drawKey, working, nudgeMode, nudges, onNudge } = props;
  const reduced = useReducedMotionPref();
  const [pos, setPos] = useState(50);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);

  const outlinePaths = useMemo(() => (result?.outline ?? []).map((pl) => polylineToPath(pl)), [result]);
  const featurePaths = useMemo(
    () => (result?.features ?? []).flatMap((g, gi) => g.polylines.map((pl, i) => ({ key: `${gi}-${i}`, d: polylineToPath(pl) }))),
    [result],
  );
  const cutout = useMemo(() => (nudgeMode ? cutoutUrl(result) : null), [nudgeMode, result]);

  // Reset slider to show the drawing when a new result arrives
  useEffect(() => {
    if (result && !nudgeMode) setPos((p) => (p > 85 ? p : 100));
  }, [drawKey, result, nudgeMode]);

  const toWork = (clientX: number, clientY: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: ((clientX - rect.left) / rect.width) * w, y: ((clientY - rect.top) / rect.height) * h };
  };

  const handlePointer = (e: React.PointerEvent, type: "down" | "move" | "up") => {
    if (!nudgeMode) return;
    if (type === "down") {
      dragging.current = true;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const p = toWork(e.clientX, e.clientY);
      lastPt.current = p;
      onNudge({ ...p, r: 0.04, mode: nudgeMode });
    } else if (type === "move" && dragging.current) {
      const p = toWork(e.clientX, e.clientY);
      const H = result?.H ?? Math.min(w, h) / 2;
      if (lastPt.current && Math.hypot(p.x - lastPt.current.x, p.y - lastPt.current.y) > 0.03 * H) {
        lastPt.current = p;
        onNudge({ ...p, r: 0.04, mode: nudgeMode });
      }
    } else if (type === "up") {
      dragging.current = false;
      lastPt.current = null;
    }
  };

  const outer = strokePx;
  const feat = Math.max(0.75, strokePx * strokeRatio);
  const drawDur = reduced ? 0 : 1.3;
  const featDur = reduced ? 0 : 0.7;

  const lines = (color: string, animate: boolean) => (
    <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 size-full" aria-hidden preserveAspectRatio="none">
      <g fill="none" stroke={color} strokeLinejoin="round" strokeLinecap="round">
        {outlinePaths.map((d, i) => (
          <motion.path
            key={`o-${drawKey}-${i}`}
            d={d}
            strokeWidth={outer}
            initial={animate ? { pathLength: 0, opacity: 0.2 } : false}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: drawDur, ease: "easeInOut" }}
          />
        ))}
        {featurePaths.map((p, i) => (
          <motion.path
            key={`f-${drawKey}-${p.key}`}
            d={p.d}
            strokeWidth={feat}
            initial={animate ? { pathLength: 0, opacity: 0 } : false}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: featDur, delay: reduced ? 0 : drawDur + Math.min(1, i * 0.04), ease: "easeOut" }}
          />
        ))}
      </g>
    </svg>
  );

  return (
    <div className="relative w-full select-none">
      <div
        ref={wrapRef}
        className={cn(
          "relative mx-auto w-full overflow-hidden rounded-xl border border-border bg-muted shadow-sm",
          nudgeMode ? "cursor-crosshair touch-none" : "",
        )}
        style={{ aspectRatio: `${w} / ${h}`, maxHeight: "68dvh", maxWidth: `calc(68dvh * ${w / h})` }}
        onPointerDown={(e) => handlePointer(e, "down")}
        onPointerMove={(e) => handlePointer(e, "move")}
        onPointerUp={(e) => handlePointer(e, "up")}
        onPointerCancel={(e) => handlePointer(e, "up")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="Your photo" className={cn("absolute inset-0 size-full object-fill", nudgeMode && cutout ? "opacity-35" : "")} draggable={false} />
        {nudgeMode && cutout && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cutout} alt="" aria-hidden className="absolute inset-0 size-full object-fill" draggable={false} />
        )}
        {working && (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-transparent via-primary/10 to-transparent motion-reduce:animate-none" aria-hidden />
        )}
        {result && !nudgeMode && (
          <div className="absolute inset-0 bg-white" style={{ clipPath: `inset(0 0 0 ${100 - pos}%)` }}>
            {lines("#000000", true)}
          </div>
        )}
        {result && nudgeMode && lines("var(--primary)", false)}
        {nudgeMode && (
          <svg viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute inset-0 size-full" aria-hidden preserveAspectRatio="none">
            {nudges.map((n, i) => (
              <circle
                key={i}
                cx={n.x}
                cy={n.y}
                r={n.r * (result?.H ?? Math.min(w, h) / 2)}
                fill={n.mode === "include" ? "rgba(21,128,61,0.35)" : "rgba(220,38,38,0.35)"}
                stroke={n.mode === "include" ? "#15803d" : "#dc2626"}
                strokeWidth={1.5}
              />
            ))}
          </svg>
        )}
        {result && !nudgeMode && (
          <div className="pointer-events-none absolute inset-y-0" style={{ left: `${100 - pos}%` }} aria-hidden>
            <div className="absolute inset-y-0 -ml-px w-0.5 bg-primary shadow" />
            <div className="absolute top-1/2 -ml-5 -mt-5 flex size-10 items-center justify-center rounded-full border-2 border-primary bg-background text-primary shadow-md">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6-6 6 6 6M15 6l6 6-6 6" /></svg>
            </div>
          </div>
        )}
      </div>
      {result && !nudgeMode && (
        <div className="mx-auto mt-3 flex max-w-md items-center gap-3 text-xs text-muted-foreground">
          <span>Photo</span>
          <input
            type="range"
            min={0}
            max={100}
            value={pos}
            onChange={(e) => setPos(Number(e.target.value))}
            aria-label="Before / after: drag to compare the photo and the outline"
            className="h-11 flex-1 cursor-pointer accent-[var(--primary)]"
          />
          <span>Outline</span>
        </div>
      )}
    </div>
  );
}
