"use client";
import { AnimatePresence, motion } from "framer-motion";
import { polylineToPath } from "@/lib/pipeline/outline";
import type { RoundRecord } from "@/lib/orchestrator/loop";
import { cn } from "@/lib/utils";

export function Filmstrip({ rounds, selected, onSelect, imageUrl, bestIndex }: {
  rounds: RoundRecord[];
  selected: number | null;
  onSelect: (i: number) => void;
  imageUrl: string;
  bestIndex: number | null;
}) {
  if (!rounds.length) return null;
  return (
    <section aria-label="Refinement rounds">
      <h2 className="mb-2 text-sm font-semibold">Refinement</h2>
      <ol className="flex snap-x gap-3 overflow-x-auto pb-2">
        <AnimatePresence initial={false}>
          {rounds.map((r) => {
            const { w, h } = r.result;
            const active = r.index === selected;
            return (
              <motion.li
                key={r.index}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="snap-start"
              >
                <button
                  type="button"
                  onClick={() => onSelect(r.index)}
                  aria-pressed={active}
                  className={cn(
                    "flex w-36 cursor-pointer flex-col gap-1.5 rounded-xl border bg-card p-2 text-left transition-colors hover:border-primary/60",
                    active ? "border-primary ring-2 ring-primary/30" : "border-border",
                  )}
                >
                  <span className="relative block overflow-hidden rounded-lg bg-white" style={{ aspectRatio: `${w} / ${h}`, maxHeight: 120 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl} alt="" className="absolute inset-0 size-full object-fill opacity-40" />
                    <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 size-full" preserveAspectRatio="none" aria-hidden>
                      <g fill="none" stroke="#000" strokeLinejoin="round">
                        {r.result.outline.map((pl, i) => <path key={i} d={polylineToPath(pl, 1, 1)} strokeWidth={Math.max(2, w / 120)} />)}
                        {r.result.features.flatMap((g, gi) => g.polylines.map((pl, i) => <path key={`${gi}-${i}`} d={polylineToPath(pl, 1, 1)} strokeWidth={Math.max(1.2, w / 220)} />))}
                      </g>
                    </svg>
                  </span>
                  <span className="flex items-center justify-between text-xs font-semibold">
                    <span>{r.label}</span>
                    <span className={r.reviewed ? "text-primary" : "text-muted-foreground"}>{Math.round(r.score * 100)}%</span>
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {r.index === bestIndex ? "★ best · " : ""}{r.caption}
                  </span>
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </section>
  );
}
