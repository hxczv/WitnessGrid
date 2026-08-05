"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getIncident, rateIncident } from "@/lib/api";
import type { RatingSummary } from "@/lib/contract";
import { useAuthStore } from "@/store/auth";

const AXES = [
  { key: "appropriateness", label: "Appropriateness" },
  { key: "professionalism", label: "Professionalism" },
  { key: "safety", label: "Safety" },
] as const;

export function RatingPanel({
  incidentId,
  ownerUserId,
  serverSummary,
}: {
  incidentId: string;
  ownerUserId: string | null;
  serverSummary: RatingSummary | null;
}) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const isOwner = user !== null && user.id === ownerUserId;

  const { data: incident } = useQuery({
    queryKey: ["incident", incidentId, token ?? null],
    queryFn: () => getIncident(incidentId, { token: token ?? undefined }),
    enabled: Boolean(token),
  });

  const summary: RatingSummary | null = incident?.rating_summary ?? serverSummary;

  const rate = useMutation({
    mutationFn: (scores: { appropriateness: number; professionalism: number; safety: number }) =>
      rateIncident(incidentId, scores, { token: token ?? undefined }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["incident", incidentId] }),
  });

  if (isOwner) return null;
  const count = summary?.count ?? 0;

  return (
    <section aria-label="Ratings" className="mb-8 rounded-md border hairline bg-surface/60 p-5">
      <h2 className="label">Ratings</h2>
      <p className="mt-1 text-sm text-paper/60">
        {count === 0
          ? "No ratings yet."
          : `Averaged from ${count} rating${count === 1 ? "" : "s"}.`}
      </p>
      {AXES.map(({ key, label }) => {
        const mine = summary?.my?.[key] ?? null;
        const avg = summary?.[`${key}_avg`] ?? null;
        return (
          <div key={key} className="mt-3">
            <div className="flex items-baseline justify-between">
              <span className="timecode text-paper/70">{label}</span>
              <span className="timecode text-amber" data-testid={`rating-avg-${key}`}>
                {avg === null ? "—" : `${avg} / 5`}
              </span>
            </div>
            <div className="mt-1 flex gap-1" role="radiogroup" aria-label={label}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={mine === n}
                  aria-label={`${label}: ${n} of 5${mine === n ? " (your rating)" : ""}`}
                  disabled={!token || rate.isPending}
                  onClick={() => {
                    const mine = summary?.my;
                    rate.mutate({
                      appropriateness: mine ? mine.appropriateness : n,
                      professionalism: mine ? mine.professionalism : n,
                      safety: mine ? mine.safety : n,
                      [key]: n,
                    });
                  }}
                  className={`h-11 w-11 rounded-md border hairline font-mono text-sm ${
                    mine !== null && n <= mine
                      ? "border-amber bg-amber/15 text-amber"
                      : "text-paper/40"
                  } ${!token ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {!token ? <p className="mt-4 text-xs text-paper/50">Sign in to rate this record.</p> : null}
      {rate.isError ? <p className="mt-2 text-xs text-flag">Could not save your rating.</p> : null}
    </section>
  );
}
