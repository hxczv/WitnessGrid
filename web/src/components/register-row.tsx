import Link from "next/link";
import { Eye, Paperclip } from "lucide-react";
import type { Incident } from "@/lib/contract";
import { mediaUrl } from "@/lib/api";
import { formatForce } from "@/lib/contract";
import { incidentTimecodeParts, refFor, typeAccent, typeLabel } from "@/lib/time";
import { isImageType } from "@/lib/media";
import { Tartan } from "@/components/tartan";

function Thumbnail({ incident }: { incident: Incident }) {
  const media = incident.media[0];
  const thumbKey = media?.thumbnail_key ?? (media && isImageType(media.type) ? media.key : null);
  if (!thumbKey) {
    return (
      <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden border hairline bg-surface sm:w-36">
        <Tartan thin className="w-full" />
      </div>
    );
  }
  return (
    <img
      src={mediaUrl(thumbKey)}
      alt=""
      width={144}
      height={96}
      loading="lazy"
      decoding="async"
      className="aspect-[4/3] h-24 w-24 shrink-0 border hairline object-cover sm:w-36"
    />
  );
}

export function RegisterRow({ incident }: { incident: Incident }) {
  const tc = incidentTimecodeParts(incident);
  const accent = typeAccent(incident.incident_type);
  return (
    <li>
      <Link
        href={`/incident/${incident.id}`}
        className="group flex items-stretch gap-4 border-b hairline transition-colors hover:bg-surface/60"
      >
        <span
          aria-hidden
          className="hidden w-0.5 shrink-0 bg-accent opacity-0 transition-opacity group-hover:opacity-100 sm:block"
          style={{ backgroundColor: accent }}
        />
        <div className="flex min-w-0 flex-1 items-start gap-4 px-3 py-4">
          <Thumbnail incident={incident} />
          <div className="min-w-0 flex-1">
            <p className="timecode flex flex-wrap items-center gap-x-3 text-muted">
              <span className="text-fg">REF {refFor(incident)}</span>
              <span>{tc.time}</span>
              <span>{tc.coordinate}</span>
            </p>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
              <span
                className="font-display text-base font-extrabold uppercase tracking-wide"
                style={{ color: accent }}
              >
                {typeLabel(incident.incident_type)}
              </span>
              <span className="text-sm text-muted">{formatForce(incident.police_force)}</span>
            </p>
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-fg/90">
              {incident.description || "No description recorded for this incident."}
            </p>
            <p className="timecode mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
              {incident.media.length > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Paperclip className="size-3" aria-hidden />
                  {incident.media.length}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <Eye className="size-3" aria-hidden />
                {incident.view_count} view{incident.view_count === 1 ? "" : "s"}
              </span>
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}

export function RegisterList({ incidents }: { incidents: Incident[] }) {
  return (
    <ul className="border-t hairline">
      {incidents.map((incident) => (
        <RegisterRow key={incident.id} incident={incident} />
      ))}
    </ul>
  );
}