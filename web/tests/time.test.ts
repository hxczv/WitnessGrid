import { describe, expect, it } from "vitest";
import type { Incident } from "@/lib/contract";
import {
  defaultDateRange,
  formatCoordinate,
  formatLocal,
  formatUTC,
  hash8,
  hashPreview,
  incidentTimecodeParts,
  isValidIso,
  typeLabel,
} from "@/lib/time";

function fixtureIncident(): Incident {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    user_id: "00000000-0000-4000-8000-000000000002",
    client_id: "00000000-0000-4000-8000-000000000003",
    incident_type: "stop_and_search",
    police_force: "metropolitan",
    timestamp: "2026-08-03T14:32:07.000Z",
    description: "A fixture record for unit tests.",
    officer_count: 2,
    collar_numbers: ["PC123"],
    media: [
      {
        key: "media/aa/aaaa.jpg",
        type: "image/jpeg",
        hash: "a".repeat(64),
        thumbnail_key: "media/aa/aaaa.thumb.jpg",
      },
    ],
    created_at: "2026-08-04T09:00:00.000Z",
    view_count: 3,
    moderation_status: "approved",
    latitude: 51.5074,
    longitude: -0.1278,
    username: "alice_witness",
  };
}

describe("formatUTC", () => {
  it("renders the machine UTC strip", () => {
    expect(formatUTC("2026-08-03T14:32:07.000Z")).toBe("14:32:07 · 03 AUG · 2026");
  });

  it("tolerates garbage input", () => {
    expect(formatUTC("not-a-date")).toBe("—");
  });
});

describe("formatLocal", () => {
  it("renders a viewer-local date with the (local) suffix", () => {
    const out = formatLocal("2026-08-03T14:32:07.000Z");
    const d = new Date("2026-08-03T14:32:07.000Z");
    const expected = `${d.getDate()} ${[
      "January", "February", "March", "April", "May", "June", "July",
      "August", "September", "October", "November", "December",
    ][d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")} (local)`;
    expect(out).toBe(expected);
  });
});

describe("hash helpers", () => {
  it("previews hash chips", () => {
    expect(hashPreview("abcdef01", 4)).toBe("#abcd…");
    expect(hash8("a".repeat(64))).toBe(`#${"a".repeat(8)}`);
  });
});

describe("isValidIso", () => {
  it("accepts ISO and rejects junk", () => {
    expect(isValidIso("2026-08-03T14:32:07.000Z")).toBe(true);
    expect(isValidIso("hello")).toBe(false);
  });
});

describe("typeLabel", () => {
  it("turns enums into human labels", () => {
    expect(typeLabel("vehicle_stop")).toBe("vehicle stop");
  });
});

describe("formatCoordinate", () => {
  it("formats lat/lon or returns a dash", () => {
    expect(formatCoordinate(51.5074, -0.1278)).toBe("51.51,-0.13");
    expect(formatCoordinate(undefined, -0.1278)).toBe("—");
  });
});

describe("incidentTimecodeParts", () => {
  it("builds the signature metadata band", () => {
    const parts = incidentTimecodeParts(fixtureIncident());
    expect(parts.time).toBe("14:32:07 · 03 AUG");
    expect(parts.force).toBe("Metropolitan");
    expect(parts.coordinate).toBe("51.51,-0.13");
    expect(parts.hash).toBe(`#${"a".repeat(8)}`);
  });
});

describe("defaultDateRange", () => {
  it("returns a UTC-spanning window ending today", () => {
    const { startDate, endDate } = defaultDateRange(7);
    expect(isValidIso(startDate)).toBe(true);
    expect(isValidIso(endDate)).toBe(true);
    expect(new Date(startDate).getTime()).toBeLessThan(new Date(endDate).getTime());
    expect(startDate.endsWith("Z")).toBe(true);
  });
});