"use client";

import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Supercluster from "supercluster";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
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
import { addVertex, closeRing, isClosed, removeLastVertex, type LngLat } from "@/lib/polygon";
import { useAuthStore } from "@/store/auth";
import { cssVar } from "@/lib/css-var";
import { SavedAreaDialog } from "@/components/saved-area-dialog";
import { StatusBanner } from "@/components/status-banner";
import { baseMapStyle, prefersDarkScheme } from "@/lib/map-tiles";

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

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
  const params = useSearchParams();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const incidentsRef = useRef<Incident[]>([]);
  const [filters, setFilters] = useState<Filters>(() => {
    const p = new URLSearchParams(params.toString());
    const days = Number(p.get("days") ?? "0") as Filters["days"];
    return {
      type: (p.get("type") as Filters["type"]) ?? "",
      policeForce: (p.get("policeForce") as Filters["policeForce"]) ?? "",
      days: [0, 7, 30, 90].includes(days) ? days : 0,
    };
  });
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [polygon, setPolygon] = useState<LngLat[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const drawingRef = useRef(false);
  drawingRef.current = drawing;
  const polygonRef = useRef(polygon);
  polygonRef.current = polygon;
  const vertexMarkersRef = useRef<maplibregl.Marker[]>([]);
  const user = useAuthStore((s) => s.user);

  const cancelDraw = () => {
    setDrawing(false);
    setPolygon([]);
    setDialogOpen(false);
  };

  useEffect(() => {
    const p = new URLSearchParams();
    if (filters.type) p.set("type", filters.type);
    if (filters.policeForce) p.set("policeForce", filters.policeForce);
    if (filters.days > 0) p.set("days", String(filters.days));
    const qs = p.toString();
    void router.replace(qs ? `/map?${qs}` : "/map", { scroll: false });
  }, [filters, router]);

  const locateMe = () => {
    const map = mapRef.current;
    if (!map || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: Math.max(map.getZoom(), 14),
        });
        void fetchVisible();
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

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

    const accent = cssVar("--accent", "#E8A33D");
    const bg = cssVar("--bg", "#12151C");
    const map = new maplibregl.Map({
      container,
      style: baseMapStyle(prefersDarkScheme()),
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
          "circle-color": accent,
          "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 25, 32],
          "circle-opacity": 0.9,
          "circle-stroke-color": bg,
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
          "text-font": ["Noto Sans Medium"],
        },
        paint: { "text-color": bg },
      });
      map.addLayer({
        id: "incident-point",
        type: "circle",
        source: "incidents",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": accent,
          "circle-radius": 7,
          "circle-stroke-color": bg,
          "circle-stroke-width": 2,
        },
      });

      map.addSource("polygon-draft", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "polygon-draft-fill",
        type: "fill",
        source: "polygon-draft",
        paint: { "fill-color": accent, "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "polygon-draft-line",
        type: "line",
        source: "polygon-draft",
        paint: { "line-color": accent, "line-width": 2 },
      });

      map.on("click", (e) => {
        if (!drawingRef.current) return;
        const hit = map.queryRenderedFeatures(e.point, {
          layers: ["incident-point", "incident-cluster"],
        });
        if (hit.length > 0) return;
        setPolygon((prev) => addVertex(prev, [e.lngLat.lng, e.lngLat.lat]));
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource("polygon-draft");
    if (!source || source.type !== "geojson") return;

    const closed = closeRing(polygon);
    let features: GeoJSON.Feature[] = [];
    if (polygon.length >= 3) {
      features = [
        { type: "Feature", geometry: { type: "Polygon", coordinates: [closed] }, properties: {} },
        { type: "Feature", geometry: { type: "LineString", coordinates: closed }, properties: {} },
      ];
    } else if (polygon.length >= 2) {
      features = [
        { type: "Feature", geometry: { type: "LineString", coordinates: polygon }, properties: {} },
      ];
    }
    (source as GeoJSONSource).setData(
      features.length > 0
        ? { type: "FeatureCollection", features }
        : EMPTY_FC,
    );
  }, [polygon]);

  useEffect(() => {
    const map = mapRef.current;
    for (const marker of vertexMarkersRef.current) marker.remove();
    vertexMarkersRef.current = [];
    if (!drawing || !map) return;
    const points = isClosed(polygon) ? polygon.slice(0, -1) : polygon;
    for (const [lng, lat] of points) {
      const el = document.createElement("div");
      el.className = "size-3 rounded-full border-2 border-accent bg-bg/80";
      vertexMarkersRef.current.push(
        new maplibregl.Marker({ element: el }).setLngLat({ lng, lat }).addTo(map),
      );
    }
  }, [drawing, polygon]);

  return (
    <div className="relative h-full w-full">
      {/* Inline styles required: maplibre adds .maplibregl-map (position:relative) to this node, which otherwise beats Tailwind's layered `absolute` and collapses the map to zero height. */}
      <div
        ref={containerRef}
        style={{ position: "absolute", inset: 0 }}
        data-testid="map"
      />

      {/* Filter panel + error banner, stacked in one column */}
      <div className="absolute left-3 top-3 z-10 flex w-[min(20rem,calc(100vw-1.5rem))] flex-col gap-2">
        <div className="panel rounded-md p-3">
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
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line text-fg/80 hover:border-accent"
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
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn flex-1" onClick={locateMe}>
              <LocateFixed className="size-4" aria-hidden />
              My location
            </button>
          </div>
        {user ? (
          drawing ? (
            <div className="mt-3 border-t hairline pt-3">
              <p className="timecode mb-2 text-accent">
                Click the map to place points.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-primary flex-1"
                  disabled={polygon.length < 3}
                  onClick={() => setDialogOpen(true)}
                >
                  Finish
                </button>
                <button type="button" className="btn flex-1" onClick={cancelDraw}>
                  Cancel
                </button>
              </div>
              <button
                type="button"
                className="timecode mt-2 w-full py-1 text-muted"
                onClick={() => setPolygon((p) => removeLastVertex(p))}
                disabled={polygon.length === 0}
              >
                undo last point ({polygon.length})
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn mt-3 w-full border-dashed"
              onClick={() => {
                setPolygon([]);
                setDrawing(true);
              }}
            >
              Save this area
            </button>
          )
        ) : null}
        </div>
        {error ? (
          <div>
            <StatusBanner kind="error" message="Records unavailable" detail={error} />
            <button type="button" className="btn mt-2 w-full" onClick={() => void fetchVisible()}>
              Retry
            </button>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="absolute right-3 top-16 z-10">
          <p className="timecode rounded-sm border hairline bg-surface/90 px-2 py-1 text-fg/90">
            Loading records…
          </p>
        </div>
      ) : null}

      {/* Viewport incident list preview */}
      <div className="absolute inset-x-3 bottom-3 z-10 sm:bottom-3" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="panel mx-auto max-w-xl rounded-md">
          <button
            type="button"
            onClick={() => setListOpen((v) => !v)}
            className="timecode flex w-full items-center justify-between px-3 py-2 text-fg/90"
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
                    <span className="truncate text-fg/90">
                      {formatForce(incident.police_force)} ·{" "}
                      {typeLabel(incident.incident_type).toUpperCase()}
                    </span>
                    <span className="shrink-0 text-accent">{incident.timestamp.slice(11, 16)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {dialogOpen ? (
        <SavedAreaDialog
          polygon={polygon}
          onClose={cancelDraw}
          onSaved={cancelDraw}
        />
      ) : null}
    </div>
  );
}