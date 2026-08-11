"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { baseMapStyle, prefersDarkScheme } from "@/lib/map-tiles";
import { cssVar } from "@/lib/css-var";
import { pinSvgDataUri } from "@/components/map/pin";

export function MiniMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = new maplibregl.Map({
      container,
      style: baseMapStyle(prefersDarkScheme()),
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
      pin.style.backgroundImage = pinSvgDataUri(
        24,
        24,
        cssVar("--accent", "#E8A33D"),
        cssVar("--bg", "#12151C"),
      );
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