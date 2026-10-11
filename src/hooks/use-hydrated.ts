"use client";
import { useEffect, useState } from "react";
import { useSettings } from "@/lib/store/settings";

/** True once the persisted settings store has been rehydrated from localStorage on the client. */
export function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => {
    if (useSettings.persist.hasHydrated()) setH(true);
    const unsub = useSettings.persist.onFinishHydration(() => setH(true));
    return unsub;
  }, []);
  return h;
}
