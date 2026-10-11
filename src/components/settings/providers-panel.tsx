"use client";
import { Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROVIDER_PRESETS } from "@/lib/critic/presets";
import { useSettings } from "@/lib/store/settings";
import { ProviderCard } from "./provider-card";

const PRESET_ITEMS = Object.fromEntries(PROVIDER_PRESETS.map((p) => [p.id, p.name]));

export function ProvidersPanel() {
  const providers = useSettings((s) => s.providers);
  const addProvider = useSettings((s) => s.addProvider);
  const reorder = useSettings((s) => s.reorderProviders);
  const [preset, setPreset] = useState("gemini");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <p className="text-sm text-muted-foreground">
              The AI reviewer is optional. It only runs when the local checks fail, and asks before sending a photo.
              Providers are tried top to bottom (fallback order). Keys stay in this browser and are sent only to that provider.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1 space-y-1.5">
              <span className="text-sm font-medium" id="preset-label">Add a provider</span>
              <Select value={preset} onValueChange={(v) => v && setPreset(v as string)} items={PRESET_ITEMS}>
                <SelectTrigger className="w-full" aria-labelledby="preset-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDER_PRESETS.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setOpenId(addProvider(preset))}><Plus aria-hidden /> Add</Button>
          </div>
        </CardContent>
      </Card>

      {providers.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No AI provider yet. Outlines still work fully on your device, checked by local metrics.
        </p>
      ) : (
        <ol className="space-y-3" aria-label="Providers in fallback order">
          {providers.map((p, i) => (
            <li
              key={p.id}
              draggable
              onDragStart={(e) => { setDragId(p.id); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (dragId) reorder(dragId, p.id); setDragId(null); }}
              onDragEnd={() => setDragId(null)}
              className={dragId === p.id ? "opacity-60" : ""}
            >
              <ProviderCard provider={p} index={i} count={providers.length} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
