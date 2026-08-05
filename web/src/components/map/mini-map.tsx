"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { baseMapStyle } from "@/lib/map-tiles";

export function MiniMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = new maplibregl.Map({
      container,
      style: baseMapStyle(),
      center: [longitude, latitude],
      zoom: 14,
      interactive: false,
      attributionControl: { compact: true },
    });
    map.on("load", () => {
      const pin = document.createElement("div");
      pin.className = "pointer-events-none";
      pin.style.width = "24px";
      pin.style.height = "24px";
      pin.style.transform = "translate(-50%, -100%)";
      pin.style.backgroundImage = `url("data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none"><path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z" fill="#E8A33D" stroke="#12151C" stroke-width="1.5"/><circle cx="12" cy="10" r="3" fill="#12151C"/></svg>`,
      )}")`;
      new maplibregl.Marker({ element: pin })
        .setLngLat([longitude, latitude])
        .addTo(map);
    });
    return () => {
      map.remove();
    };
  }, [latitude, longitude]);

  return (
    <div
      ref={containerRef}
      className="aspect-video w-full overflow-hidden rounded-md border hairline"
      data-testid="incident-minimap"
      aria-hidden
    />
  );
}