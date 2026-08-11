// The service is UK/Ireland-only for now. Records outside this box are
// rejected at creation and the maps are clamped to it. Widen this box (or
// drop the check) when international support lands.
export const UK_IE_BOUNDS = {
  west: -11,
  south: 49,
  east: 3,
  north: 61,
} as const;

export function isInsideBounds(lon: number, lat: number): boolean {
  return (
    lon >= UK_IE_BOUNDS.west &&
    lon <= UK_IE_BOUNDS.east &&
    lat >= UK_IE_BOUNDS.south &&
    lat <= UK_IE_BOUNDS.north
  );
}