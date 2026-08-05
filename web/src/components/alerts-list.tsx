"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Bell } from "lucide-react";
import { listAlerts } from "@/lib/api";
import { formatForce } from "@/lib/contract";
import { formatLocal, typeLabel } from "@/lib/time";

export function AlertsList({ token }: { token: string }) {
  const alerts = useQuery({
    queryKey: ["alerts"],
    queryFn: () => listAlerts({ token }),
  });

  return (
    <section aria-label="Alerts" className="mt-6 rounded-md border hairline bg-surface/60 p-5">
      <h2 className="label">Alerts</h2>
      {alerts.isError ? (
        <p className="mt-2 text-sm text-flag">Could not load your alerts.</p>
      ) : alerts.data ? (
        alerts.data.items.length === 0 ? (
          <p className="timecode mt-2 text-paper/50">
            No alerts yet — new records inside your saved areas will appear here and by email.
          </p>
        ) : (
          <ul className="mt-2">
            {alerts.data.items.map((alert) => (
              <li key={alert.id}>
                <Link
                  href={`/incident/${alert.incident_id}`}
                  className="flex items-center gap-3 border-b hairline px-1 py-2.5 hover:bg-surface"
                >
                  <Bell className="size-4 shrink-0 text-amber" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      <span className="font-semibold">{alert.area_name}</span> ·{" "}
                      {typeLabel(alert.incident.incident_type)} ·{" "}
                      {formatForce(alert.incident.police_force)}
                    </span>
                    <span className="timecode text-paper/50">
                      {formatLocal(alert.created_at)} · {alert.incident.timestamp.slice(0, 10)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : (
        <p className="timecode mt-2 text-paper/50">loading…</p>
      )}
    </section>
  );
}
