import Link from "next/link";
import { Eye, Paperclip } from "lucide-react";
import type { Incident } from "@/lib/contract";
import { mediaUrl } from "@/lib/api";
import { formatForce } from "@/lib/contract";
import { incidentTimecodeParts, typeLabel } from "@/lib/time";
import { isImageType } from "@/lib/media";
import { Tartan } from "@/components/tartan";

function Thumbnail({ incident }: { incident: Incident }) {
  const media = incident.media[0];
  const thumbKey = media?.thumbnail_key ?? (media && isImageType(media.type) ? media.key : null);
  if (!thumbKey) {
    return (
      <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-sm border hairline bg-surface sm:w-36">
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
      className="h-24 w-24 shrink-0 rounded-sm border hairline object-cover sm:w-36"
    />
  );
}

export function RegisterRow({ incident }: { incident: Incident }) {
  const tc = incidentTimecodeParts(incident);
  return (
    <li>
      <Link
        href={`/incident/${incident.id}`}
        className="flex items-start gap-4 border-b hairline px-3 py-4 transition-colors hover:bg-surface/60"
      >
        <Thumbnail incident={incident} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-sm font-bold uppercase tracking-wide">
              {typeLabel(incident.incident_type)}
            </span>
            <span className="text-sm text-muted">{formatForce(incident.police_force)}</span>
          </p>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-fg/90">
            {incident.description || "No description recorded for this incident."}
          </p>
          <p className="timecode mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
            <span>{tc.time}</span>
            <span>{tc.coordinate}</span>
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
