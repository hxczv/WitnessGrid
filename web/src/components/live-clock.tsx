"use client";

import { useEffect, useState } from "react";
import { formatUTC } from "@/lib/time";

export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <span className="timecode text-accent">UTC —:—:—</span>;
  return (
    <span className="timecode text-accent" aria-live="off">
      {formatUTC(now.toISOString())} · UTC
    </span>
  );
}
