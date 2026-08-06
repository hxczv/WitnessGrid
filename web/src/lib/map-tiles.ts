import type { StyleSpecification } from "maplibre-gl";

// OSM raster tiles are CORS-enabled, key-free and reliable for local dev.
// Override via NEXT_PUBLIC_MAP_TILES_URL with any {z}/{x}/{y} raster template
// (vector/PMTiles archives are not supported by this style).
export const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILES_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export function tileHostname(): string {
  try {
    return new URL(TILE_URL.replace("{z}", "0").replace("{x}", "0").replace("{y}", "0")).hostname;
  } catch {
    return "tile.openstreetmap.org";
  }
}

export function baseMapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sources: {
      basemap: {
        type: "raster",
        tiles: [TILE_URL],
        tileSize: 256,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  };
}
