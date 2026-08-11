import type { StyleSpecification } from "maplibre-gl";

// CARTO raster tiles are CORS-enabled, key-free and reliable for local dev.
// Override the dark URL via NEXT_PUBLIC_MAP_TILES_URL with any {z}/{x}/{y}
// raster template (vector/PMTiles archives are not supported by this style).
export const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILES_URL ||
  "https://basemaps.cartocdn.com/{s}/dark_all/{z}/{x}/{y}.png";

const LIGHT_TILE_URL = "https://basemaps.cartocdn.com/{s}/light_all/{z}/{x}/{y}.png";

// {s} and zoom/x/y placeholders must be substituted before the URL can be
// parsed, otherwise "{s}.basemaps.cartocdn.com" is treated as a literal
// hostname and matches nothing in a CSP allowlist.
function normalizedTileUrl(): string {
  return TILE_URL.replace("{s}", "a").replace("{z}", "0").replace("{x}", "0").replace("{y}", "0");
}

export function tileHostname(): string {
  try {
    return new URL(normalizedTileUrl()).hostname;
  } catch {
    return "basemaps.cartocdn.com";
  }
}

export function tileOrigin(): string {
  try {
    return new URL(normalizedTileUrl()).origin;
  } catch {
    return "https://basemaps.cartocdn.com";
  }
}

/** Dark by default, matching the site chrome; respects a light-system preference. */
export function prefersDarkScheme(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches !== true;
}

export function baseMapStyle(prefersDark = true): StyleSpecification {
  const url = prefersDark ? TILE_URL : LIGHT_TILE_URL;
  return {
    version: 8,
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sources: {
      basemap: {
        type: "raster",
        tiles: [url],
        tileSize: 256,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
      },
    },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  };
}
