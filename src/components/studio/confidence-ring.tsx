"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function ConfidenceRing({ value, label, tone }: { value: number; label: string; tone: "pass" | "warn" | "muted" }) {
  const r = 22, c = 2 * Math.PI * r;
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-3" role="img" aria-label={`Confidence ${pct}% — ${label}`}>
      <svg viewBox="0 0 56 56" className="size-14 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--muted)" strokeWidth="6" />
        <motion.circle
          cx="28" cy="28" r={r} fill="none" strokeWidth="6" strokeLinecap="round"
          stroke={tone === "pass" ? "var(--success)" : tone === "warn" ? "var(--warning)" : "var(--primary)"}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
        <text x="28" y="28" textAnchor="middle" dominantBaseline="central" className="fill-foreground text-[13px] font-semibold" transform="rotate(90 28 28)">
          {pct}%
        </text>
      </svg>
      <div className="leading-tight">
        <div className="text-xs text-muted-foreground">Confidence</div>
        <div className={cn("text-sm font-semibold", tone === "pass" ? "text-success" : tone === "warn" ? "text-warning" : "text-foreground")}>{label}</div>
      </div>
    </div>
  );
}
