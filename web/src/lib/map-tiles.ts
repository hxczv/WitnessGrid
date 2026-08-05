import type { StyleSpecification } from "maplibre-gl";

// OSM raster tiles are CORS-enabled, key-free and reliable for local dev.
// Override via NEXT_PUBLIC_MAP_TILES_URL to swap in a different tile URL.
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILES_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

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
