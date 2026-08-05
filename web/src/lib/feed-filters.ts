import type { IncidentType, PoliceForce } from "@/lib/contract";

export interface FeedFilters {
  q: string;
  type: IncidentType | undefined;
  policeForce: PoliceForce | undefined;
}

export const EMPTY_FILTERS: FeedFilters = { q: "", type: undefined, policeForce: undefined };

export function feedFiltersKey(filters: FeedFilters): string {
  return JSON.stringify(filters);
}
