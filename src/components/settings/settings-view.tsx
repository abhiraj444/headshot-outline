"use client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHydrated } from "@/hooks/use-hydrated";
import { ProvidersPanel } from "./providers-panel";
import { LoopPanel } from "./loop-panel";
import { AlgorithmPanel } from "./algorithm-panel";
import { DataPanel } from "./data-panel";

export function SettingsView() {
  const hydrated = useHydrated();
  if (!hydrated) return <div className="h-96 animate-pulse rounded-2xl bg-muted" aria-busy="true" aria-label="Loading settings" />;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Saved in this browser only. Every setting is used the next time you process a photo.</p>
      </div>
      <Tabs defaultValue="providers">
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="providers">AI providers</TabsTrigger>
          <TabsTrigger value="loop">Loop</TabsTrigger>
          <TabsTrigger value="algorithm">Algorithm</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
        </TabsList>
        <TabsContent value="providers" className="pt-4"><ProvidersPanel /></TabsContent>
        <TabsContent value="loop" className="pt-4"><LoopPanel /></TabsContent>
        <TabsContent value="algorithm" className="pt-4"><AlgorithmPanel /></TabsContent>
        <TabsContent value="data" className="pt-4"><DataPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
