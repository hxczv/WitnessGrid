"use client";

import { useEffect, useState } from "react";

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"] as const;

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
      {pad(now.getUTCHours())}:{pad(now.getUTCMinutes())}:{pad(now.getUTCSeconds())} ·
      {pad(now.getUTCDate())} {MONTHS[now.getUTCMonth()] ?? "???"} · {now.getUTCFullYear()} · UTC
    </span>
  );
}
