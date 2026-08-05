export type LngLat = [number, number];

export function addVertex(polygon: LngLat[], p: LngLat, max = 32): LngLat[] {
  if (polygon.length >= max) return polygon;
  return [...polygon, p];
}

export function removeLastVertex(polygon: LngLat[]): LngLat[] {
  return polygon.slice(0, -1);
}

export function isClosed(polygon: LngLat[]): boolean {
  if (polygon.length < 3) return false;
  const a = polygon[0]!;
  const b = polygon[polygon.length - 1]!;
  return a[0] === b[0] && a[1] === b[1];
}

export function closeRing(polygon: LngLat[]): LngLat[] {
  if (isClosed(polygon) || polygon.length < 3) return polygon;
  return [...polygon, polygon[0]!];
}

/** Shoelace area in degrees², converted to a rough km² approximation at mid-latitudes. */
export function ringAreaSqKm(polygon: LngLat[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i]!;
    const [x2, y2] = polygon[(i + 1) % polygon.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  const degSq = Math.abs(sum) / 2;
  return degSq * (111.32 * 69.3);
}
