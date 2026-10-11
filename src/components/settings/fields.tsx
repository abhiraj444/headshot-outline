"use client";
import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function Field({ label, hint, children, htmlFor, className }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SwitchField({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-start justify-between gap-4 py-1">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-1" />
    </div>
  );
}

/** Optional number: empty = unset (not sent). Validates on blur. */
export function OptionalNumber({ label, hint, value, onChange, min, max, step, integer }: {
  label: string; hint?: string; value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: number; integer?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setText(value === undefined ? "" : String(value)); }, [value]);
  const commit = () => {
    const t = text.trim();
    if (!t) { setErr(null); onChange(undefined); return; }
    let n = Number(t);
    if (!Number.isFinite(n)) { setErr("Enter a number or leave empty"); return; }
    if (integer) n = Math.round(n);
    if (min !== undefined && n < min) { setErr(`Minimum ${min}`); return; }
    if (max !== undefined && n > max) { setErr(`Maximum ${max}`); return; }
    setErr(null);
    onChange(n);
  };
  return (
    <Field label={label} hint={err ? undefined : hint} htmlFor={id}>
      <Input id={id} inputMode="decimal" placeholder="not sent" value={text} step={step}
        aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined}
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
      {err && <p id={`${id}-err`} className="text-xs text-destructive">{err}</p>}
    </Field>
  );
}

export function SliderField({ label, hint, value, onChange, min, max, step, format }: {
  label: string; hint?: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; format?: (v: number) => string;
}) {
  const id = useId();
  return (
    <div className="space-y-2 py-1">
      <div className="flex items-center justify-between gap-2">
        <Label id={id} className="text-sm font-medium">{label}</Label>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{format ? format(value) : value}</span>
      </div>
      <div className="flex min-h-11 items-center">
        <Slider aria-labelledby={id} min={min} max={max} step={step} value={[value]}
          onValueChange={(v) => onChange(Array.isArray(v) ? (v as number[])[0] : (v as number))} />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
