import { ImageResponse } from "next/og";
import { getIncident, serverApiBaseUrl } from "@/lib/api";
import { formatForce } from "@/lib/contract";
import { formatUTC, hash8, typeLabel } from "@/lib/time";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

async function fetchIncident(id: string) {
  try {
    return await getIncident(id, { baseUrl: serverApiBaseUrl() });
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: Props) {
  const { id } = await params;
  const incident = await fetchIncident(id);

  const title = incident
    ? `${typeLabel(incident.incident_type)} · ${formatForce(incident.police_force)}`
    : "WitnessGrid";
  const line = incident
    ? `${formatUTC(incident.timestamp)} · ${incident.latitude.toFixed(3)},${incident.longitude.toFixed(3)} · ${hash8(incident.media[0]?.hash ?? incident.id)}`
    : "A public register of UK police interactions";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#12151C",
          color: "#E8E6DE",
          padding: 56,
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 22, letterSpacing: 6, textTransform: "uppercase", color: "#E8A33D" }}>
            WitnessGrid
          </div>
          <div style={{ fontSize: 16, letterSpacing: 3, color: "#8A8F9C" }}>EVIDENCE REGISTER</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1, color: "#E8E6DE" }}>
            {title}
          </div>
          <div
            style={{
              marginTop: 24,
              width: 120,
              height: 8,
              background: "#E8A33D",
            }}
          />
          <div
            style={{
              marginTop: 20,
              fontSize: 24,
              letterSpacing: 1,
              color: "#E8A33D",
              textTransform: "uppercase",
            }}
          >
            {line}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, letterSpacing: 2, color: "#8A8F9C" }}>
          <span>UTC · STORED TAMPER-EVIDENT</span>
          <span>UNVERIFIED WITNESS ACCOUNT</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}