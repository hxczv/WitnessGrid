import type { Metadata } from "next";
import dynamic from "next/dynamic";

export const metadata: Metadata = {
  title: "Map",
  description: "Browse the WitnessGrid incident map by location, force and type.",
};

const MapView = dynamic(
  () => import("@/components/map/map-view").then((m) => m.MapView),
  {
    loading: () => (
      <div className="grid h-full place-items-center">
        <p className="timecode text-paper/60">Loading map…</p>
      </div>
    ),
  },
);

export default function MapPage() {
  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <MapView />
    </main>
  );
}