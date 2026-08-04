import { formatForce, type Incident, type IncidentType, type PoliceForce } from "@/lib/contract";

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function isValidIso(iso: string): boolean {
  return !Number.isNaN(new Date(iso).getTime());
}

/** Machine-verified UTC strip: 14:32:07 · 03 AUG · 2026 */
export function formatUTC(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} · ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()] ?? "???"} · ${d.getUTCFullYear()}`;
}

/** Viewer-local rendering: 3 August 2026, 14:32 (local) */
export function formatLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${MONTHS_LONG[d.getMonth()] ?? "??"} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())} (local)`;
}

/** First `len` hex digits of a sha256, presented as a hash chip. */
export function hashPreview(hash: string, len = 4): string {
  return `#${hash.slice(0, len)}…`;
}

export function hash8(hash: string): string {
  return `#${hash.slice(0, 8)}`;
}

export function formatCoordinate(lat: number | undefined, lon: number | undefined): string {
  if (lat === undefined || lon === undefined || Number.isNaN(lat) || Number.isNaN(lon)) return "—";
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

export interface TimecodeParts {
  time: string;
  force: string;
  coordinate: string;
  hash: string;
}

/** The signature dashcam-style metadata band for an incident. */
export function incidentTimecodeParts(incident: Incident): TimecodeParts {
  return {
    time: `${incident.timestamp.slice(11, 19)} · ${pad(new Date(incident.timestamp).getUTCDate())} ${MONTHS[new Date(incident.timestamp).getUTCMonth()] ?? "???"}`,
    force: formatForce(incident.police_force),
    coordinate: formatCoordinate(incident.latitude, incident.longitude),
    hash: hash8(firstHash(incident)),
  };
}

function firstHash(incident: Incident): string {
  const h = incident.media[0]?.hash;
  return h && /^[a-f0-9]{64}$/.test(h) ? h : incident.id;
}

export function typeLabel(type: IncidentType): string {
  return type.replaceAll("_", " ");
}

export function forceLabel(force: PoliceForce): string {
  return formatForce(force);
}

/** Default date-range bounds for filters, in UTC ISO form. */
export function defaultDateRange(daysBack: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(end.getUTCDate() - daysBack);
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(23, 59, 59, 999);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}