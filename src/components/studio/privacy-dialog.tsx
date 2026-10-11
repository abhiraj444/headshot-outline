"use client";
import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function PrivacyDialog({ open, providers, onAnswer }: { open: boolean; providers: string[]; onAnswer: (ok: boolean, remember: boolean) => void }) {
  const [remember, setRemember] = useState(true);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onAnswer(false, false); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldAlert className="size-5 text-warning" aria-hidden /> Send the photo for AI review?</DialogTitle>
          <DialogDescription className="space-y-2 text-left">
            <span className="block">The local checks did not fully pass. To refine the outline, a small side-by-side preview of your photo (with the outline drawn on it) will be sent to: <strong>{providers.join(", ") || "your AI provider"}</strong>.</span>
            <span className="block">The photo leaves your device. Free tiers of some providers may use submitted data for training. Your API key is only sent to that provider.</span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-11 items-center gap-3">
          <Switch id="remember-consent" checked={remember} onCheckedChange={setRemember} />
          <Label htmlFor="remember-consent">Don&apos;t ask again on this device</Label>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onAnswer(false, false)}>Keep on device</Button>
          <Button onClick={() => onAnswer(true, remember)}>Send for review</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
