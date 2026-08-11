import type { StatsPublic } from "@/lib/contract";

export function StatsBand({ stats }: { stats: StatsPublic }) {
  const forces = stats.by_force.length;
  return (
    <dl className="grid grid-cols-2 gap-px border-y hairline bg-line sm:grid-cols-4">
      <LedgerStat k="Records on the register" v={String(stats.total_incidents)} />
      <LedgerStat k="Public views" v={String(stats.total_views)} />
      <LedgerStat k="Forces covered" v={String(forces)} />
      <LedgerStat
        k="Average rating"
        v={stats.avg_rating === null ? "—" : `${stats.avg_rating.toFixed(1)} / 5`}
      />
    </dl>
  );
}

function LedgerStat({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-surface/60 px-4 py-3">
      <dt className="timecode text-muted">{k}</dt>
      <dd className="mt-1 font-display text-2xl font-extrabold tracking-tight text-fg">{v}</dd>
    </div>
  );
}