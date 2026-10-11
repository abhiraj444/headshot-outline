"use client";
import { Download, Trash2, Upload, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { clearEntries, deleteEntry, listEntries, type TuningEntry } from "@/lib/memory/tuning";
import { exportSettings, useSettings } from "@/lib/store/settings";
import { download } from "@/lib/ui/export";
import { SwitchField } from "./fields";

export function DataPanel() {
  const [entries, setEntries] = useState<TuningEntry[]>([]);
  const [includeKeys, setIncludeKeys] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importSettings = useSettings((s) => s.importSettings);
  const resetAll = useSettings((s) => s.resetAll);
  const refresh = () => listEntries().then(setEntries);
  useEffect(() => { refresh(); }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Tuning memory</CardTitle>
          <CardDescription>Parameter sets that passed, grouped by image class. Parameters only — never images. Stored in IndexedDB.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {entries.length === 0 ? <p className="text-sm text-muted-foreground">Nothing saved yet.</p> : (
            <ul className="divide-y divide-border rounded-lg border">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="flex-1">
                    <div className="font-medium">{e.image_class.pose.replace("_", "-")} · {e.image_class.hair} hair · {e.image_class.accessories}</div>
                    <div className="text-xs text-muted-foreground">{Math.round(e.final_score * 100)}% · {e.rounds_needed} round(s) · {new Date(e.timestamp).toLocaleString()} · v{e.schema_version}</div>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Delete entry" onClick={async () => { await deleteEntry(e.id!); refresh(); }}><Trash2 /></Button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" disabled={!entries.length} onClick={async () => { await clearEntries(); refresh(); toast.success("Tuning memory cleared"); }}>
            <Trash2 aria-hidden /> Clear tuning memory
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Export / import settings</CardTitle><CardDescription>Providers, loop, algorithm and device settings as JSON.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <SwitchField label="Include API keys" hint="Off by default. Only include keys if you trust where the file goes." checked={includeKeys} onChange={setIncludeKeys} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => download(new Blob([JSON.stringify(exportSettings(includeKeys), null, 2)], { type: "application/json" }), "headshot-outline-settings.json")}>
              <Download aria-hidden /> Export
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload aria-hidden /> Import</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Import settings file"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  const r = importSettings(JSON.parse(await f.text()));
                  if (r.ok) toast.success(r.message); else toast.error(r.message);
                } catch (err) {
                  toast.error("Could not import", { description: (err as Error).message });
                }
              }} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Reset</CardTitle><CardDescription>Remove all providers and keys and restore every default.</CardDescription></CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setConfirmReset(true)}><RotateCcw aria-hidden /> Reset all settings</Button>
        </CardContent>
      </Card>
      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset all settings?</DialogTitle>
            <DialogDescription>This deletes every provider and API key in this browser and restores defaults. Tuning memory is kept.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { resetAll(); setConfirmReset(false); toast.success("Settings reset"); }}>Reset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
