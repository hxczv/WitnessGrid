"use client";

import Link from "next/link";
import type { StatsPeriod } from "@/lib/contract";

const PERIODS: { label: string; value: StatsPeriod }[] = [
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "All", value: "all" },
];

export function PeriodSwitch({ current, basePath }: { current: StatsPeriod; basePath: string }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Stats period">
      {PERIODS.map((p) => (
        <Link
          key={p.value}
          href={`${basePath}?period=${p.value}`}
          aria-current={current === p.value ? "true" : undefined}
          className={`min-h-9 rounded-sm border px-3 text-xs font-semibold uppercase tracking-wide transition-colors ${
            current === p.value
              ? "border-accent bg-accent text-on-accent"
              : "border-line text-fg/80 hover:border-accent"
          }`}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
