"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiDelete } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

export function DeleteIncident({ incidentId, ownerUserId }: { incidentId: string; ownerUserId: string | null }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token || !user || ownerUserId === null || user.id !== ownerUserId) return null;

  const deleteIt = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiDelete(`/incident/${incidentId}`, { token });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Could not delete the record.");
    }
  };

  return (
    <div className="rounded-md border border-danger/40 bg-danger/5 p-4">
      <h2 className="font-display text-base font-bold text-danger">Withdraw this record</h2>
      <p className="mt-1 text-sm text-fg/80">
        Deleting removes the record and all of its media permanently. This is
        your right to erasure — it cannot be undone.
      </p>
      {!confirming ? (
        <button
          type="button"
          className="btn btn-danger mt-3"
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="size-4" aria-hidden />
          Delete record
        </button>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void deleteIt()}>
            {busy ? "Deleting…" : "Yes, delete permanently"}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      )}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </div>
  );
}