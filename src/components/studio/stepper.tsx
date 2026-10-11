"use client";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEPS } from "./use-studio";

export function Stepper({ step, error }: { step: number; error?: boolean }) {
  return (
    <ol className="flex items-center gap-1 sm:gap-2" aria-label={`Progress: step ${Math.min(step + 1, STEPS.length)} of ${STEPS.length}`}>
      {STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-1 sm:gap-2" aria-current={current ? "step" : undefined}>
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                done && "border-primary bg-primary text-primary-foreground",
                current && !error && "border-primary text-primary",
                current && error && "border-destructive text-destructive",
                !done && !current && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            <span className={cn("hidden text-xs font-medium sm:inline", current ? "text-foreground" : "text-muted-foreground")}>{label}</span>
            {i < STEPS.length - 1 && <span className={cn("h-px flex-1", done ? "bg-primary" : "bg-border")} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
