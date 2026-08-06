"use client";

import { mediaUrl } from "@/lib/api";
import type { Incident } from "@/lib/contract";

export function MediaGallery({ incident }: { incident: Incident }) {
  if (incident.media.length === 0) {
    return <p className="timecode text-paper/50">No media attached to this record.</p>;
  }
  return (
    <ul className="grid gap-3">
      {incident.media.map((m) => (
        <li key={m.key} className="overflow-hidden rounded-md border hairline bg-black/40">
          {m.type.startsWith("video/") ? (
            <video
              controls
              preload="none"
              poster={m.thumbnail_key ? mediaUrl(m.thumbnail_key) : undefined}
              className="max-h-[70vh] w-full"
              aria-label={`Video evidence (${m.type})`}
            >
              <source src={mediaUrl(m.key)} type={m.type} />
            </video>
          ) : (
            <img
              src={mediaUrl(m.key)}
              alt={`Evidence image ${m.hash.slice(0, 8)}`}
              loading="lazy"
              decoding="async"
              className="max-h-[70vh] w-full object-contain"
            />
          )}
          <p className="timecode border-t hairline bg-surface/60 px-3 py-1.5 text-paper/50">
            {m.type} · {m.hash.slice(0, 12)}…
          </p>
        </li>
      ))}
    </ul>
  );
}