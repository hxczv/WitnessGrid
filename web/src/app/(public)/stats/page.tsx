import type { Metadata } from "next";
import { getStatsPublic, serverApiBaseUrl } from "@/lib/api";
import type { StatsPeriod } from "@/lib/contract";
import { formatForce } from "@/lib/contract";
import { typeLabel } from "@/lib/time";
import { BarChart, LineChart } from "@/components/charts";
import { PeriodSwitch } from "@/components/period-switch";
import { StatusBanner } from "@/components/status-banner";
import { Tartan } from "@/components/tartan";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stats",
  description: "Aggregate statistics for the WitnessGrid public register.",
};

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = typeof sp.period === "string" ? sp.period : "30d";
  const period: StatsPeriod = raw === "90d" || raw === "all" ? raw : "30d";
  const periodLabel = period === "90d" ? "90" : period === "all" ? "all time" : "30";
  let stats: Awaited<ReturnType<typeof getStatsPublic>> | null = null;
  let error: string | null = null;
  try {
    stats = await getStatsPublic(period, { baseUrl: serverApiBaseUrl() });
  } catch (err) {
    error = err instanceof Error ? err.message : "The API could not be reached.";
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Stats.</h1>
        <p className="mt-2 max-w-2xl text-fg/80">
          What our witnesses have recorded, in aggregate.
        </p>
        <div className="mt-4">
          <PeriodSwitch current={period} basePath="/stats" />
        </div>
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
            <p className="mt-2 font-display text-4xl font-extrabold text-accent">
              {stats.total_incidents}
            </p>
            <p className="timecode text-muted">
              {stats.total_views} view{stats.total_views === 1 ? "" : "s"}
            </p>
            {stats.avg_rating !== null ? (
              <p className="timecode mt-3 text-muted">
                Average rating across rated records:{" "}
                <span className="text-accent">{stats.avg_rating.toFixed(1)} / 5</span>
              </p>
            ) : null}
          </section>
          <section className="rounded-md border hairline bg-surface/60 p-5">
            <h2 className="label">Last {periodLabel} days</h2>
            <LineChart
              label={`Incidents recorded per day, last ${periodLabel} days`}
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
