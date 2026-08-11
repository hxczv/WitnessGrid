import type { Metadata } from "next";
import nextDynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ApiClientError, getIncident, serverApiBaseUrl, type IncidentDetail } from "@/lib/api";
import { formatForce, type Incident } from "@/lib/contract";
import { formatLocal, formatUTC, hash8, incidentHash, incidentTimecodeParts, refFor, typeAccent, typeLabel } from "@/lib/time";
import { DeleteIncident } from "@/components/delete-incident";
import { MediaGallery } from "@/components/media-gallery";
import { RatingPanel } from "@/components/rating-panel";
import { ReportIncident } from "@/components/report-incident";
import { Tartan } from "@/components/tartan";
import { Timecode } from "@/components/timecode";

export const dynamic = "force-dynamic";

const MiniMap = nextDynamic(() => import("@/components/map/mini-map").then((m) => m.MiniMap), {
  loading: () => (
    <div className="aspect-video w-full animate-pulse rounded-md border hairline bg-surface" />
  ),
});

// Cached so generateMetadata and the page share one request. Only a real 404
// maps to "not found"; any other failure (outage, timeout) propagates to the
// error boundary instead of hiding as a missing record.
const fetchIncident = cache(async (id: string): Promise<IncidentDetail | null> => {
  try {
    return await getIncident(id, { baseUrl: serverApiBaseUrl() });
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) return null;
    throw err;
  }
});

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const incident = await fetchIncident(id);
  if (!incident) return { title: "Record not available" };
  const description =
    (incident.description || "An incident recorded on the WitnessGrid register.").slice(0, 160);
  const title = `${typeLabel(incident.incident_type)} · ${formatForce(incident.police_force)}`;
  return {
    title,
    description,
    openGraph: {
      title: `${title} — ${formatUTC(incident.timestamp)}`,
      description,
      images: [{ url: `/assets/og/${incident.id}`, width: 1200, height: 630 }],
    },
  };
}

export default async function IncidentPage({ params }: Props) {
  const { id } = await params;
  const incident = await fetchIncident(id);
  if (!incident) notFound();

  const tc = incidentTimecodeParts(incident);
  const accent = typeAccent(incident.incident_type);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="rounded-md border hairline bg-surface/60">
        <div aria-hidden className="h-1 w-full rounded-t-md" style={{ backgroundColor: accent }} />
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
          <h1 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl">
            {typeLabel(incident.incident_type)} · {formatForce(incident.police_force)}
          </h1>
          <p className="timecode text-muted">
            <span className="text-fg">REF {refFor(incident)}</span>
            <span aria-hidden> · </span>
            {incident.view_count} views
          </p>
        </div>
        <Timecode
          parts={[
            tc.time,
            tc.force,
            tc.coordinate,
            tc.hash,
            incident.location_accuracy_m !== null &&
            incident.location_accuracy_m !== undefined
              ? `±${incident.location_accuracy_m}m`
              : undefined,
          ].filter((p): p is string => Boolean(p))}
          className="border-t hairline bg-bg/70 px-4 py-2 text-accent"
        />
      </header>

      <Tartan className="my-6" />

      <section aria-label="Media" className="mb-8">
        <MediaGallery incident={incident} />
      </section>

      <section aria-label="Location" className="mb-8">
        <MiniMap latitude={incident.latitude} longitude={incident.longitude} />
        <p className="timecode mt-2 text-muted">
          Pin placed by the witness {incident.location_accuracy_m !== null && incident.location_accuracy_m !== undefined
            ? `(captured at ±${incident.location_accuracy_m}m)`
            : "(no GPS accuracy captured)"}
        </p>
      </section>

      <section aria-label="Narrative" className="mb-8">
        <h2 className="label">Witness account</h2>
        <p className="whitespace-pre-wrap text-lg leading-relaxed">
          {incident.description || "No description was recorded with this submission."}
        </p>
        <p className="mt-3 text-sm text-muted">
          Reported by{" "}
          <span className="timecode text-accent">
            {incident.username ? `@${incident.username}` : "anonymous witness"}
          </span>{" "}
          · {formatLocal(incident.created_at)}
        </p>
      </section>

      <RatingPanel
        incidentId={incident.id}
        ownerUserId={incident.user_id}
        serverSummary={incident.rating_summary ?? null}
      />

      <section aria-label="Record facts" className="mb-8">
        <h2 className="label">Record facts</h2>
        <dl className="timecode grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <Fact k="Recorded (UTC)" v={formatUTC(incident.timestamp)} />
          <Fact k="Reported (UTC)" v={formatUTC(incident.created_at)} />
          <Fact k="Incident type" v={typeLabel(incident.incident_type).toUpperCase()} />
          <Fact k="Police force" v={formatForce(incident.police_force).toUpperCase()} />
          <Fact
            k="Officer count"
            v={incident.officer_count !== null && incident.officer_count !== undefined ? String(incident.officer_count) : "—"}
          />
          <Fact
            k="Collar numbers"
            v={incident.collar_numbers && incident.collar_numbers.length > 0 ? incident.collar_numbers.join(", ") : "—"}
          />
          <Fact k="Coordinates" v={tc.coordinate} />
          <Fact k="Media hash" v={hash8(incidentHash(incident))} />
        </dl>
      </section>

      <section aria-label="Actions" className="grid gap-4 sm:grid-cols-2">
        <ReportIncident incidentId={incident.id} />
        <DeleteIncident incidentId={incident.id} ownerUserId={incident.user_id} />
      </section>
    </main>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b hairline py-1.5">
      <dt className="text-muted">{k}</dt>
      <dd className="text-fg">{v}</dd>
    </div>
  );
}