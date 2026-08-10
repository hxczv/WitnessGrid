"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { baseMapStyle } from "@/lib/map-tiles";
import { cssVar } from "@/lib/css-var";
import { pinSvgDataUri } from "@/components/map/pin";

export interface Pin {
  lat: number;
  lon: number;
  accuracy: number | null;
}

// Interactive pin-placement map: click to place, drag to fine-tune.
// Kept in its own module so maplibre-gl only loads when the report wizard
// reaches the pin step.
export function PinMap({ pin, onPin }: { pin: Pin | null; onPin: (p: Pin) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pinRef = useRef<Pin | null>(pin);
  pinRef.current = pin;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: light)").matches !== true;
    const map = new maplibregl.Map({
      container,
      style: baseMapStyle(prefersDark),
      center: [pinRef.current?.lon ?? -1.5, pinRef.current?.lat ?? 52.7],
      zoom: pinRef.current ? 14 : 5.5,
      attributionControl: { compact: true },
    });

    let marker: maplibregl.Marker | null = null;
    const placePin = (lng: number, lat: number) => {
      onPin({ lat, lon: lng, accuracy: null });
      marker?.remove();
      const el = document.createElement("div");
      el.style.width = "26px";
      el.style.height = "38px";
      el.style.transform = "translate(-50%, -100%)";
      el.style.backgroundImage = pinSvgDataUri(
        26,
        38,
        cssVar("--accent", "#E8A33D"),
        cssVar("--bg", "#12151C"),
      );
      marker = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat([lng, lat])
        .addTo(map);
      marker.on("dragend", () => {
        const pos = marker?.getLngLat();
        if (pos) onPin({ lat: pos.lat, lon: pos.lng, accuracy: null });
      });
    };

    map.on("load", () => {
      if (pinRef.current) placePin(pinRef.current.lon, pinRef.current.lat);
    });
    map.on("click", (e) => {
      const { lng, lat } = e.lngLat;
      placePin(lng, lat);
    });
    return () => {
      marker?.remove();
      map.remove();
    };
    // The map is created once; pin/onPin updates flow through refs and events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="aspect-[4/3] w-full overflow-hidden rounded-md border hairline"
      data-testid="pin-map"
    />
  );
}
