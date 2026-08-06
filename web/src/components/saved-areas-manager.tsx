"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteSavedArea, listSavedAreas } from "@/lib/api";

export function SavedAreasManager({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const areas = useQuery({
    queryKey: ["saved-areas"],
    queryFn: () => listSavedAreas({ token }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSavedArea(id, { token }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["saved-areas"] }),
  });

  return (
    <section aria-label="Saved areas" className="mt-6 rounded-md border hairline bg-surface/60 p-5">
      <h2 className="label">Saved areas</h2>
      {areas.isError ? (
        <p className="mt-2 text-sm text-danger">Could not load your saved areas.</p>
      ) : areas.data ? (
        areas.data.length === 0 ? (
          <p className="timecode mt-2 text-muted">
            None yet — draw a polygon on the map and save it to watch a place.
          </p>
        ) : (
          <ul className="mt-2">
            {areas.data.map((area) => (
              <li
                key={area.id}
                className="flex items-center justify-between gap-3 border-b hairline py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{area.name}</p>
                  <p className="timecode text-muted">
                    {area.polygon.length - 1} points · {area.alerts} alert
                    {area.alerts === 1 ? "" : "s"}
                  </p>
                </div>
                <DeleteAreaButton
                  onConfirm={() => remove.mutate(area.id)}
                  busy={remove.isPending}
                />
              </li>
            ))}
          </ul>
        )
      ) : (
        <p className="timecode mt-2 text-muted">loading…</p>
      )}
    </section>
  );
}

function DeleteAreaButton({ onConfirm, busy }: { onConfirm: () => void; busy: boolean }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button
        type="button"
        className="btn p-2"
        aria-label="Delete this saved area"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button type="button" className="btn btn-danger px-3" disabled={busy} onClick={onConfirm}>
        {busy ? "Deleting…" : "Delete"}
      </button>
      <button type="button" className="btn px-3" onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </div>
  );
}
