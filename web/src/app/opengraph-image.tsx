import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "WitnessGrid — the public register of UK police interactions";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#12151C",
          color: "#E8E6DE",
          padding: 64,
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 6,
              background: "#E8A33D",
              color: "#12151C",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 32,
            }}
          >
            W
          </div>
          <div style={{ fontSize: 28, letterSpacing: 2, fontWeight: 700 }}>WITNESSGRID</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1, maxWidth: 900 }}>
            The public register of police interactions.
          </div>
          <div style={{ marginTop: 24, fontSize: 28, color: "#A6A89F" }}>
            Timestamped · geolocated · media-backed records by witnesses.
          </div>
        </div>
        <div
          style={{
            height: 8,
            background: "#E8A33D",
          }}
        />
      </div>
    ),
    size,
  );
}
