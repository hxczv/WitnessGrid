import type { Metadata } from "next";
import { getStatsPublic, serverApiBaseUrl } from "@/lib/api";
import { formatForce } from "@/lib/contract";
import { typeLabel } from "@/lib/time";
import { BarChart, LineChart } from "@/components/charts";
import { StatusBanner } from "@/components/status-banner";
import { Tartan } from "@/components/tartan";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stats",
  description: "Aggregate statistics for the WitnessGrid public register.",
};

export default async function StatsPage() {
  let stats: Awaited<ReturnType<typeof getStatsPublic>> | null = null;
  let error: string | null = null;
  try {
    stats = await getStatsPublic("30d", { baseUrl: serverApiBaseUrl() });
  } catch (err) {
    error = err instanceof Error ? err.message : "The API could not be reached.";
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Stats.</h1>
        <p className="mt-2 max-w-2xl text-paper/70">
          What our witnesses have recorded, in aggregate.
        </p>
      </header>
      <Tartan thin />
      {error ? (
        <div className="py-8">
          <StatusBanner kind="error" message="Stats unavailable." detail={error} />
        </div>
      ) : null}
      {stats ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-md border hairline bg-surface/60 p-5">
            <h2 className="label">Totals</h2>
            <p className="mt-2 font-display text-4xl font-extrabold text-amber">
              {stats.total_incidents}
            </p>
            <p className="timecode text-paper/60">
              {stats.total_views} view{stats.total_views === 1 ? "" : "s"}
            </p>
            {stats.avg_rating !== null ? (
              <p className="timecode mt-3 text-paper/60">
                Average rating across rated records:{" "}
                <span className="text-amber">{stats.avg_rating.toFixed(1)} / 5</span>
              </p>
            ) : null}
          </section>
          <section className="rounded-md border hairline bg-surface/60 p-5">
            <h2 className="label">Last 30 days</h2>
            <LineChart
              label="Incidents recorded per day, last 30 days"
              data={stats.series_30d.map((d) => ({ label: d.day, value: d.count }))}
            />
          </section>
          <section className="rounded-md border hairline bg-surface/60 p-5">
            <h2 className="label">By incident type</h2>
            <BarChart
              label="Incidents by type"
              data={stats.by_type.map((d) => ({ label: typeLabel(d.type), value: d.count }))}
            />
          </section>
          <section className="rounded-md border hairline bg-surface/60 p-5">
            <h2 className="label">By police force</h2>
            <BarChart
              label="Incidents by police force"
              data={stats.by_force.map((d) => ({ label: formatForce(d.force), value: d.count }))}
            />
          </section>
        </div>
      ) : null}
    </main>
  );
}
