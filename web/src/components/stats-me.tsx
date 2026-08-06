"use client";

import { useQuery } from "@tanstack/react-query";
import { getStatsMe } from "@/lib/api";

export function StatsMeSection({ token }: { token: string }) {
  const stats = useQuery({
    queryKey: ["stats-me"],
    queryFn: () => getStatsMe({ token }),
  });

  const rows: Array<[string, string]> = stats.data
    ? [
        ["Submissions", String(stats.data.total_incidents)],
        ["Approved", String(stats.data.approved_incidents)],
        ["Total views", String(stats.data.total_views)],
        ["Ratings received",
          stats.data.avg_rating_received === null
            ? "none"
            : `${stats.data.avg_rating_received.toFixed(1)} / 5`],
        ["Ratings given", String(stats.data.ratings_given)],
        ["Saved areas", String(stats.data.saved_areas)],
        ["Alerts received", String(stats.data.alerts_received)],
      ]
    : [];

  return (
    <section aria-label="Your stats" className="mt-6 rounded-md border hairline bg-surface/60 p-5">
      <h2 className="label">Your stats</h2>
      {stats.isError ? (
        <p className="mt-2 text-sm text-danger">Could not load your stats.</p>
      ) : stats.data ? (
        <dl className="timecode mt-2 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b hairline py-1.5">
              <dt className="text-muted">{k}</dt>
              <dd className="text-fg">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="timecode mt-2 text-muted">loading…</p>
      )}
    </section>
  );
}
