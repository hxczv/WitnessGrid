"use client";

import { useEffect } from "react";
import { initQueueFlushDriver } from "@/lib/app-flush";

/**
 * App-shell lifecycle hooks: request persistent storage and drive the
 * offline queue on foreground/online events (no Background Sync dependency).
 */
export function PwaLifecycle() {
  useEffect(() => {
    if (navigator.storage?.persist) {
      void navigator.storage.persist().catch(() => {
        /* persist() is a hint; ignore denial */
      });
    }
    const stop = initQueueFlushDriver();
    return stop;
  }, []);
  return null;
}