"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Search, X } from "lucide-react";
import { INCIDENT_TYPES, POLICE_FORCES } from "@/lib/contract";
import type { FeedFilters } from "@/lib/feed-filters";

export function FeedFiltersBar({ initialFilters }: { initialFilters: FeedFilters }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(initialFilters.q);
  const [type, setType] = useState(initialFilters.type ?? "");
  const [policeForce, setPoliceForce] = useState(initialFilters.policeForce ?? "");

  const apply = (nextQ: string, nextType: string, nextForce: string) => {
    const params = new URLSearchParams();
    const trimmed = nextQ.trim();
    if (trimmed) params.set("q", trimmed);
    if (nextType) params.set("type", nextType);
    if (nextForce) params.set("policeForce", nextForce);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const active = Boolean(q.trim() || type || policeForce);

  return (
    <form
      role="search"
      aria-label="Filter the register"
      className="flex flex-wrap items-end gap-3 rounded-md border hairline bg-surface/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        apply(q, type, policeForce);
      }}
    >
      <label className="min-w-56 flex-1">
        <span className="label">Search</span>
        <input
          className="field"
          type="search"
          autoComplete="off"
          placeholder="Describe, police number, hash…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <label className="w-40">
        <span className="label">Incident type</span>
        <select className="field" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Any type</option>
          {INCIDENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="w-48">
        <span className="label">Police force</span>
        <select className="field" value={policeForce} onChange={(e) => setPoliceForce(e.target.value)}>
          <option value="">Any force</option>
          {POLICE_FORCES.map((f) => (
            <option key={f} value={f}>
              {f.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">
          <Search className="size-4" aria-hidden />
          Filter
        </button>
        {active ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setQ("");
              setType("");
              setPoliceForce("");
              apply("", "", "");
            }}
          >
            <X className="size-4" aria-hidden />
            Clear
          </button>
        ) : null}
      </div>
    </form>
  );
}
