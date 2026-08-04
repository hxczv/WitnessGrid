"use client";

import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { layers, namedFlavor } from "@protomaps/basemaps";
import { Protocol } from "pmtiles";
import Supercluster from "supercluster";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { listIncidents } from "@/lib/api";
import { formatForce } from "@/lib/contract";
import {
  INCIDENT_TYPES,
  POLICE_FORCES,
  type Incident,
  type IncidentType,
  type ListIncidentsQuery,
  type PoliceForce,
} from "@/lib/contract";
import { defaultDateRange, typeLabel } from "@/lib/time";
import { StatusBanner } from "@/components/status-banner";
import { MAP_TILES_URL } from "@/lib/map-tiles";

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

function buildStyle(tilesUrl: string): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sprite: "https://protomaps.github.io/basemaps-assets/sprites/v4/dark",
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${tilesUrl}`,
        attribution:
          '© <a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: layers("protomaps", namedFlavor("dark"), { lang: "en" }),
  };
}

interface Filters {
  type: IncidentType | "";
  policeForce: PoliceForce | "";
  days: 0 | 7 | 30 | 90;
}

const DATE_RANGES: { label: string; days: Filters["days"] }[] = [
  { label: "All", days: 0 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export function MapView() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const incidentsRef = useRef<Incident[]>([]);
  const [filters, setFilters] = useState<Filters>({ type: "", policeForce: "", days: 0 });
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);

  const fetchVisible = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const query: ListIncidentsQuery = {
      limit: 50,
      minLon: b.getWest(),
      minLat: b.getSouth(),
      maxLon: b.getEast(),
      maxLat: b.getNorth(),
    };
    if (filtersRef.current.type) query.type = filtersRef.current.type;
    if (filtersRef.current.policeForce) query.policeForce = filtersRef.current.policeForce;
    if (filtersRef.current.days > 0) {
      const range = defaultDateRange(filtersRef.current.days);
      query.startDate = range.startDate;
      query.endDate = range.endDate;
    }
    setLoading(true);
    try {
      const res = await listIncidents(query);
      setIncidents(res.items);
      incidentsRef.current = res.items;
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load incidents for this area.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    const map = new maplibregl.Map({
      container,
      style: buildStyle(MAP_TILES_URL),
      center: [-2.8, 54.2],
      zoom: 5.5,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onMoveEnd = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void fetchVisible(), 400);
    };

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource("incidents", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "incident-cluster",
        type: "circle",
        source: "incidents",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#E8A33D",
          "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 25, 32],
          "circle-opacity": 0.9,
          "circle-stroke-color": "#12151C",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "incident-cluster-count",
        type: "symbol",
        source: "incidents",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 11,
          "text-font": ["Noto Sans Bold"],
        },
        paint: { "text-color": "#12151C" },
      });
      map.addLayer({
        id: "incident-point",
        type: "circle",
        source: "incidents",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#E8A33D",
          "circle-radius": 7,
          "circle-stroke-color": "#12151C",
          "circle-stroke-width": 2,
        },
      });

      map.on("click", "incident-cluster", (e) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const [lon, lat] = feature.geometry.coordinates;
        map.easeTo({
          center: [lon ?? 0, lat ?? 0],
          zoom: Math.min(18, map.getZoom() + 2),
        });
      });

      map.on("click", "incident-point", (e) => {
        const feature = e.features?.[0];
        const id = feature?.properties?.id;
        if (typeof id === "string") void router.push(`/incident/${id}`);
      });

      map.on("mouseenter", "incident-point", () => map.getCanvas().style.cursor = "pointer");
      map.on("mouseleave", "incident-point", () => map.getCanvas().style.cursor = "");
      map.on("mouseenter", "incident-cluster", () => map.getCanvas().style.cursor = "pointer");
      map.on("mouseleave", "incident-cluster", () => map.getCanvas().style.cursor = "");

      map.on("moveend", onMoveEnd);
      void fetchVisible();
    });

    return () => {
      if (debounce) clearTimeout(debounce);
      map.remove();
      maplibregl.removeProtocol("pmtiles");
      mapRef.current = null;
    };
  }, [fetchVisible, router]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource("incidents");
    if (!source || source.type !== "geojson") return;

    const index = new Supercluster<Supercluster.AnyProps, Supercluster.AnyProps>({
      radius: 70,
      maxZoom: 14,
      minZoom: 2,
    });
    index.load(
      incidents.map((incident) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [incident.longitude, incident.latitude],
        },
        properties: { id: incident.id },
      })),
    );
    const bounds = map.getBounds();
    const zoom = Math.max(0, map.getZoom());
    const clusters = index.getClusters(
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      zoom,
    );
    (source as GeoJSONSource).setData({ type: "FeatureCollection", features: clusters });
  }, [incidents]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" data-testid="map" />

      {/* Filter panel */}
      <div className="panel absolute left-3 top-3 z-10 w-[min(20rem,calc(100vw-1.5rem))] rounded-md p-3">
        <p className="label">Register filters</p>
        <div className="flex flex-col gap-2">
          <label className="block">
            <span className="sr-only">Incident type</span>
            <select
              className="field"
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value as Filters["type"] })}
            >
              <option value="">All types</option>
              {INCIDENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Police force</span>
            <select
              className="field"
              value={filters.policeForce}
              onChange={(e) =>
                setFilters({ ...filters, policeForce: e.target.value as Filters["policeForce"] })
              }
            >
              <option value="">All forces</option>
              {POLICE_FORCES.map((f) => (
                <option key={f} value={f}>
                  {formatForce(f)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-1">
            {DATE_RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => setFilters({ ...filters, days: r.days })}
                aria-pressed={filters.days === r.days}
                className={`min-h-9 flex-1 rounded-sm border px-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                  filters.days === r.days
                    ? "border-amber bg-amber text-ink"
                    : "border-line text-paper/70 hover:border-amber"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn w-full"
            onClick={() => void fetchVisible()}
            disabled={loading}
          >
            Apply filters
          </button>
        </div>
      </div>

      {loading ? (
        <div className="absolute right-3 top-16 z-10">
          <p className="timecode rounded-sm border hairline bg-surface/90 px-2 py-1 text-paper/80">
            Loading records…
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="absolute left-3 top-3 z-20 w-[min(22rem,calc(100vw-1.5rem))]">
          <StatusBanner kind="error" message="Records unavailable" detail={error} />
          <button type="button" className="btn mt-2 w-full" onClick={() => void fetchVisible()}>
            Retry
          </button>
        </div>
      ) : null}

      {/* Viewport incident list preview */}
      <div className="absolute inset-x-3 bottom-3 z-10 sm:bottom-3" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="panel mx-auto max-w-xl rounded-md">
          <button
            type="button"
            onClick={() => setListOpen((v) => !v)}
            className="timecode flex w-full items-center justify-between px-3 py-2 text-paper/80"
            aria-expanded={listOpen}
          >
            <span>
              {incidents.length} record{incidents.length === 1 ? "" : "s"} in view
            </span>
            <span aria-hidden>{listOpen ? "▾" : "▸"}</span>
          </button>
          {listOpen && incidents.length > 0 ? (
            <ul className="max-h-44 overflow-y-auto border-t hairline">
              {incidents.slice(0, 5).map((incident) => (
                <li key={incident.id}>
                  <button
                    type="button"
                    onClick={() => void router.push(`/incident/${incident.id}`)}
                    className="timecode flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface"
                  >
                    <span className="truncate text-paper/80">
                      {formatForce(incident.police_force)} ·{" "}
                      {typeLabel(incident.incident_type).toUpperCase()}
                    </span>
                    <span className="shrink-0 text-amber">{incident.timestamp.slice(11, 16)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}