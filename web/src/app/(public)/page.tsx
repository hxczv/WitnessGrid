import type { Metadata } from "next";
import { Map } from "lucide-react";
import Link from "next/link";
import { getStatsPublic, listIncidents, serverApiBaseUrl } from "@/lib/api";
import { ListIncidentsQuerySchema, type Incident } from "@/lib/contract";
import type { FeedFilters } from "@/lib/feed-filters";
import { EMPTY_FILTERS } from "@/lib/feed-filters";
import { FeedFiltersBar } from "@/components/feed-filters";
import { HowItWorks } from "@/components/how-it-works";
import { LiveClock } from "@/components/live-clock";
import { LoadMore } from "@/components/load-more";
import { SignInCta } from "@/components/sign-in-cta";
import { StatsBand } from "@/components/stats-band";
import { StatusBanner } from "@/components/status-banner";
import { Tartan } from "@/components/tartan";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Public register",
  description:
    "The public register of UK police interactions, recorded by witnesses.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const parsed = ListIncidentsQuerySchema.safeParse({
    q: sp.q ?? "",
    type: sp.type,
    policeForce: sp.policeForce,
  });
  const filters: FeedFilters = parsed.success
    ? { q: parsed.data.q ?? "", type: parsed.data.type, policeForce: parsed.data.policeForce }
    : EMPTY_FILTERS;
  const query = parsed.success ? { ...parsed.data, limit: 25 } : { limit: 25 };

  let items: Incident[] = [];
  let nextCursor: string | null = null;
  let error: string | null = null;
  let detail: string | null = null;

  try {
    const res = await listIncidents(query, { baseUrl: serverApiBaseUrl() });
    items = res.items;
    nextCursor = res.next_cursor;
  } catch (err) {
    error = "The register is temporarily unavailable.";
    detail =
      err instanceof Error && err.message ? err.message : "The API could not be reached.";
  }

  let stats: Awaited<ReturnType<typeof getStatsPublic>> | null = null;
  try {
    stats = await getStatsPublic("30d", { baseUrl: serverApiBaseUrl() });
  } catch {
    stats = null;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 border-t-2 hairline">
        <p className="timecode flex flex-wrap items-center justify-between gap-2 border-b hairline py-2 text-muted">
          <span>THE PUBLIC REGISTER · WITNESSGRID</span>
          <LiveClock />
        </p>
        <h1 className="font-display mt-8 max-w-3xl text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
          Every police interaction,{" "}
          <span className="text-accent">recorded by witnesses.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-fg/80">
          WitnessGrid is a public, pseudonymous evidence register of interactions
          between the public and UK police — timestamped, geolocated, media-backed,
          and verified against a moderation queue. Anyone can browse; witnesses
          record.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <SignInCta />
          <Link href="/map" className="btn">
            <Map className="size-5" aria-hidden />
            Browse the map
          </Link>
        </div>
      </header>

      {stats ? (
        <div className="mb-8">
          <StatsBand stats={stats} />
        </div>
      ) : null}

      <Tartan thin />

      <FeedFiltersBar initialFilters={filters} />

      {error ? (
        <div className="py-8">
          <StatusBanner kind="error" message={error} detail={detail ?? undefined} />
          <p className="mt-3 text-sm text-muted">
            The register needs its API service running. If you are viewing a live
            deployment this is a temporary outage — the records themselves are
            unchanged.
          </p>
        </div>
      ) : null}

      <LoadMore
        initialItems={items}
        initialCursor={nextCursor}
        ssrFailed={Boolean(error)}
        filters={filters}
      />

      <p className="mt-4 px-3 text-xs text-muted">
        Reports are the witnesses&apos; own recordings and have not been
        independently verified. Timestamps and coordinates were captured at
        record time and may be adjusted by the witness.
      </p>

      <HowItWorks />
    </main>
  );
}