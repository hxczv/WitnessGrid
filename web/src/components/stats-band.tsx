import type { StatsPublic } from "@/lib/contract";

export function StatsBand({ stats }: { stats: StatsPublic }) {
  const forces = stats.by_force.length;
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border hairline bg-line sm:grid-cols-4">
      <Stat k="Records on the register" v={String(stats.total_incidents)} />
      <Stat k="Public views" v={String(stats.total_views)} />
      <Stat k="Forces covered" v={String(forces)} />
      <Stat
        k="Average rating"
        v={stats.avg_rating === null ? "—" : `${stats.avg_rating.toFixed(1)} / 5`}
      />
    </dl>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-surface/60 px-4 py-3">
      <dt className="timecode text-muted">{k}</dt>
      <dd className="mt-1 font-display text-2xl font-extrabold tracking-tight text-fg">{v}</dd>
    </div>
  );
}
