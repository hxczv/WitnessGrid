"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { createSavedArea } from "@/lib/api";
import { closeRing, ringAreaSqKm, type LngLat } from "@/lib/polygon";
import { useAuthStore } from "@/store/auth";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

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
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Focus trap: keep Tab cycling inside the panel, close on Escape, and put
  // focus back on the opener when the dialog unmounts.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("input, button")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [onClose]);

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
      className="fixed inset-0 z-50 grid place-items-center bg-bg/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Save this area"
    >
      <div ref={panelRef} className="w-full max-w-md rounded-md border hairline bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Save this area</h2>
          <button type="button" className="btn p-2" onClick={onClose} aria-label="Close">
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <p className="mt-2 text-sm text-fg/80">
          <MapPin className="mr-1 inline size-4 text-accent" aria-hidden />
          {ring.length - (ring.length > 0 ? 1 : 0)} points · approx {areaKm2.toFixed(0)} km²
        </p>

        {tooLarge ? (
          <p className="mt-3 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent">
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
            placeholder="e.g. High Street nightlife"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

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
