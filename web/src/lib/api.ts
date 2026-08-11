import {
  ApiErrorSchema,
  IncidentSchema,
  ListAlertsResultSchema,
  ListIncidentsResultSchema,
  RatingSummarySchema,
  SavedAreaSchema,
  StatsMeSchema,
  StatsPublicSchema,
  type Incident,
  type ListAlertsResult,
  type ListIncidentsQuery,
  type ListIncidentsResult,
  type RatingSummary,
  type SavedArea,
  type Session,
  type StatsMe,
  type StatsPeriod,
  type StatsPublic,
} from "@/lib/contract";

const DEFAULT_API_BASE_URL = "http://localhost:8787";

/** Base URL for client-side calls (bundled from NEXT_PUBLIC_*). */
function publicApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;
}

/** Base URL for server-side calls; prefers the non-public server var. */
export function serverApiBaseUrl(): string {
  return (
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    DEFAULT_API_BASE_URL
  );
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }

  /** True for outcomes that warrant keeping a queued submission for retry. */
  get retryable(): boolean {
    return (
      this.status === 0 ||
      this.status >= 500 ||
      this.code === "storage_error" ||
      this.code === "rate_limited" ||
      this.code === "unauthorized" ||
      this.code === "forbidden"
    );
  }
}

export function isApiError(err: unknown): err is ApiClientError {
  return err instanceof ApiClientError;
}

export interface ApiOptions {
  baseUrl?: string;
  token?: string | null;
}

function resolveBase(opts: ApiOptions): string {
  return opts.baseUrl ?? publicApiBaseUrl();
}

function toApiClientError(status: number, payload: unknown): ApiClientError {
  if (payload !== null && typeof payload === "object" && "error" in payload) {
    const parsed = ApiErrorSchema.safeParse(payload);
    if (parsed.success) {
      return new ApiClientError(status, parsed.data.error.code, parsed.data.error.message);
    }
  }
  return new ApiClientError(status, "unknown_error", `API request failed (status ${status})`);
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  opts: ApiOptions,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (opts.token) headers.set("Authorization", `Bearer ${opts.token}`);

  let res: Response;
  try {
    res = await fetch(`${resolveBase(opts)}${path}`, { ...init, headers });
  } catch (cause) {
    throw new ApiClientError(
      0,
      "network_error",
      `Cannot reach the API (${cause instanceof Error ? cause.message : String(cause)})`,
    );
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw toApiClientError(res.status, payload);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function apiGet<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  return requestJson<T>(path, { method: "GET", cache: "no-store" }, opts);
}

export function apiPost<T>(
  path: string,
  body: unknown,
  opts: ApiOptions = {},
): Promise<T> {
  return requestJson<T>(
    path,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    },
    opts,
  );
}

export function apiDelete<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  return requestJson<T>(path, { method: "DELETE", cache: "no-store" }, opts);
}

export function apiPatch<T>(
  path: string,
  body: unknown,
  opts: ApiOptions = {},
): Promise<T> {
  return requestJson<T>(
    path,
    {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    },
    opts,
  );
}

/**
 * PUT a blob to an absolute upload URL (signed PUT target returned by
 * `POST /upload`). The backend supplies the required headers.
 */
export async function apiUpload(
  uploadUrl: string,
  headers: Record<string, string>,
  body: Blob,
): Promise<void> {
  const res = await fetch(uploadUrl, { method: "PUT", headers, body });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw toApiClientError(res.status, payload);
  }
}

export function buildQuery(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function mediaUrl(key: string): string {
  const safe = key.split("/").map(encodeURIComponent).join("/");
  return `${publicApiBaseUrl()}/media/${safe}`;
}

function parseOrThrow<T>(schema: { safeParse: (d: unknown) => { success: boolean; data?: T } }, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiClientError(0, "unknown_error", "Malformed API response payload");
  return parsed.data as T;
}

export async function listIncidents(
  query: Partial<ListIncidentsQuery>,
  opts: ApiOptions = {},
): Promise<ListIncidentsResult> {
  const data = await apiGet<unknown>(
    `/incidents${buildQuery(query as Record<string, string | number | null | undefined>)}`,
    opts,
  );
  return parseOrThrow<ListIncidentsResult>(ListIncidentsResultSchema, data);
}

/** A detail-page incident bundled with its rating summary (when one exists). */
export type IncidentDetail = Incident & { rating_summary?: RatingSummary };

export async function getIncident(id: string, opts: ApiOptions = {}): Promise<IncidentDetail> {
  const data = await apiGet<unknown>(`/incident/${encodeURIComponent(id)}`, opts);
  const incident = parseOrThrow<Incident>(IncidentSchema, data);
  const ratingRaw = (data as { rating_summary?: unknown }).rating_summary;
  if (ratingRaw === undefined) return incident;
  const parsed = RatingSummarySchema.safeParse(ratingRaw);
  if (!parsed.success) {
    throw new ApiClientError(0, "unknown_error", "Malformed API response payload");
  }
  return { ...incident, rating_summary: parsed.data };
}

export async function requestMagicLink(email: string, username?: string): Promise<{ ok: boolean }> {
  return apiPost<{ ok: boolean }>("/auth/magic-link", { email, username });
}

export async function verifyMagicToken(token: string): Promise<Session> {
  return apiPost<Session>("/auth/verify", { token });
}

/** The signed-in user's own incidents (all moderation statuses). */
export async function listMyIncidents(
  query: Partial<ListIncidentsQuery>,
  opts: ApiOptions = {},
): Promise<ListIncidentsResult> {
  const data = await apiGet<unknown>(
    `/incidents/mine${buildQuery(query as Record<string, string | number | null | undefined>)}`,
    opts,
  );
  return parseOrThrow<ListIncidentsResult>(ListIncidentsResultSchema, data);
}

export interface IncidentRating {
  incident_id: string;
  appropriateness: number;
  professionalism: number;
  safety: number;
}

export async function rateIncident(
  incidentId: string,
  scores: { appropriateness: number; professionalism: number; safety: number },
  opts: ApiOptions = {},
): Promise<{ incident: Incident | null; summary: RatingSummary }> {
  const data = await apiPatch<unknown>(
    `/ratings/${encodeURIComponent(incidentId)}`,
    scores,
    opts,
  );
  const payload = data as { incident?: unknown; summary?: unknown };
  const parsed = RatingSummarySchema.safeParse(payload.summary);
  if (!parsed.success) {
    throw new ApiClientError(0, "unknown_error", "Malformed API response payload");
  }
  return {
    incident: (payload.incident as Incident | undefined) ?? null,
    summary: parsed.data,
  };
}

export async function listSavedAreas(opts: ApiOptions = {}): Promise<SavedArea[]> {
  const data = await apiGet<unknown>("/saved-areas", opts);
  return (data as unknown[]).map((item) => {
    const parsed = SavedAreaSchema.safeParse(item);
    if (!parsed.success) {
      throw new ApiClientError(0, "unknown_error", "Malformed API response payload");
    }
    return parsed.data;
  });
}

export async function createSavedArea(
  input: { name: string; polygon: [number, number][] },
  opts: ApiOptions = {},
): Promise<SavedArea> {
  const data = await apiPost<unknown>("/saved-areas", input, opts);
  return parseOrThrow<SavedArea>(SavedAreaSchema, data);
}

export async function deleteSavedArea(id: string, opts: ApiOptions = {}): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/saved-areas/${encodeURIComponent(id)}`, opts);
}

export async function listAlerts(opts: ApiOptions = {}): Promise<ListAlertsResult> {
  const data = await apiGet<unknown>("/alerts", opts);
  return parseOrThrow<ListAlertsResult>(ListAlertsResultSchema, data);
}

export async function getStatsPublic(period: StatsPeriod = "30d", opts: ApiOptions = {}): Promise<StatsPublic> {
  const data = await apiGet<unknown>(`/stats?period=${period}`, opts);
  return parseOrThrow<StatsPublic>(StatsPublicSchema, data);
}

export async function getStatsMe(opts: ApiOptions = {}): Promise<StatsMe> {
  const data = await apiGet<unknown>("/stats/me", opts);
  return parseOrThrow<StatsMe>(StatsMeSchema, data);
}

export async function deleteAccount(opts: ApiOptions = {}): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>("/auth/me", opts);
}