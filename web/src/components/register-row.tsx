import Link from "next/link";
import { Eye } from "lucide-react";
import type { Incident } from "@/lib/contract";
import { mediaUrl } from "@/lib/api";
import { incidentTimecodeParts, typeLabel } from "@/lib/time";
import { Tartan } from "@/components/tartan";

function Thumbnail({ incident }: { incident: Incident }) {
  const media = incident.media[0];
  const thumbKey = media?.thumbnail_key ?? (media && media.type.startsWith("image/") ? media.key : null);
  if (!thumbKey) {
    return (
      <div className="grid h-24 w-36 place-items-center overflow-hidden border hairline bg-surface">
        <Tartan thin className="w-full" />
      </div>
    );
  }
  return (
    <img
      src={mediaUrl(thumbKey)}
      alt=""
      loading="lazy"
      decoding="async"
      className="h-24 w-36 shrink-0 rounded-sm border hairline object-cover"
    />
  );
}

export function RegisterRow({ incident }: { incident: Incident }) {
  const tc = incidentTimecodeParts(incident);
  return (
    <li>
      <Link
        href={`/incident/${incident.id}`}
        className="flex items-start gap-4 border-b hairline px-3 py-3 transition-colors hover:bg-surface/60"
      >
        <div className="timecode flex w-36 shrink-0 flex-col gap-0.5 text-paper/70">
          <span className="text-paper">{tc.time}</span>
          <span className="text-amber">{tc.force}</span>
          <span>{typeLabel(incident.incident_type).toUpperCase()}</span>
          <span>{tc.coordinate}</span>
          <span>{tc.hash}</span>
        </div>
        <Thumbnail incident={incident} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-3 text-sm leading-relaxed text-paper/90">
            {incident.description || "No description recorded for this incident."}
          </p>
          <p className="timecode mt-1.5 flex items-center gap-1 text-paper/40">
            <Eye className="size-3.5" aria-hidden />
            {incident.view_count} view{incident.view_count === 1 ? "" : "s"}
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