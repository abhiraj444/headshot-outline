"use client";
import { ImagePlus, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/"));
        if (f) onFile(f);
      }}
      className={cn(
        "flex min-h-[52dvh] flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed bg-card px-6 py-10 text-center transition-colors",
        over ? "border-primary bg-accent" : "border-border",
      )}
    >
      <div className="flex size-16 items-center justify-center rounded-2xl bg-accent text-primary">
        <ImagePlus className="size-8" aria-hidden />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Turn a photo into a head outline</h1>
        <p className="mx-auto max-w-prose text-base text-muted-foreground">
          Drop a photo here, paste one, or pick from your gallery. You get clean black line art of the head and face.
        </p>
      </div>
      <Button size="lg" onClick={() => inputRef.current?.click()} className="min-w-48">
        <ImagePlus aria-hidden /> Choose photo
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Choose a photo"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-4 text-success" aria-hidden />
        Processed on your device. AI review is optional and asks first.
      </p>
    </div>
  );
}
