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
  // The root shell reserves 5rem for the mobile bottom nav, so the map only
  // gets full viewport height from lg up.
  return (
    <main className="relative h-[calc(100dvh-5rem)] w-full overflow-hidden lg:h-dvh">
      <MapView />
    </main>
  );
}