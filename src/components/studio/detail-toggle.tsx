"use client";
import { cn } from "@/lib/utils";
import type { StudioDetail } from "@/lib/store/settings";

const OPTIONS: { value: StudioDetail; label: string; hint: string }[] = [
  { value: "outline", label: "Outline", hint: "Head silhouette only" },
  { value: "features", label: "Features", hint: "Outline plus eyes, brows, nose, lips, ears, hairline" },
  { value: "detailed", label: "Detailed", hint: "Everything, including ear curves, glasses lenses and irises" },
];

export function DetailToggle({ value, onChange, disabled }: { value: StudioDetail; onChange: (v: StudioDetail) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Detail" className="inline-flex rounded-xl bg-muted p-1">
      {OPTIONS.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.hint}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const i = OPTIONS.findIndex((x) => x.value === value);
              if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); onChange(OPTIONS[(i + 1) % OPTIONS.length].value); }
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); onChange(OPTIONS[(i + OPTIONS.length - 1) % OPTIONS.length].value); }
            }}
            tabIndex={active ? 0 : -1}
            className={cn(
              "min-h-11 cursor-pointer rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
