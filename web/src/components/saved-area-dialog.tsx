"use client";

import { useState } from "react";
import { MapPin, X } from "lucide-react";
import { createSavedArea } from "@/lib/api";
import { closeRing, ringAreaSqKm, type LngLat } from "@/lib/polygon";
import { useAuthStore } from "@/store/auth";

export function SavedAreaDialog({
  polygon,
  onClose,
  onSaved,
}: {
  polygon: LngLat[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const token = useAuthStore((s) => s.token);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ring = closeRing(polygon);
  const areaKm2 = ringAreaSqKm(ring);
  const tooLarge = areaKm2 > 10000;

  const save = async () => {
    if (!token || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createSavedArea({ name: name.trim(), polygon: ring }, { token });
      onSaved();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Could not save this area.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Save this area"
    >
      <div className="w-full max-w-md rounded-md border hairline bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Save this area</h2>
          <button type="button" className="btn p-2" onClick={onClose} aria-label="Close">
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <p className="mt-2 text-sm text-paper/70">
          <MapPin className="mr-1 inline size-4 text-amber" aria-hidden />
          {ring.length - (ring.length > 0 ? 1 : 0)} points · approx {areaKm2.toFixed(0)} km²
        </p>

        {tooLarge ? (
          <p className="mt-3 rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
            This area is very large — you will be alerted for every new record inside it,
            which may be a lot.
          </p>
        ) : null}

        <label className="mt-4 block">
          <span className="label">Name this area</span>
          <input
            className="field"
            value={name}
            maxLength={100}
            autoFocus
            placeholder="e.g. High Street nightlife"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {error ? <p className="mt-3 text-sm text-flag">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !name.trim()}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save area"}
          </button>
        </div>
      </div>
    </div>
  );
}
