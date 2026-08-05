import { describe, expect, it } from "vitest";
import {
  addVertex,
  closeRing,
  isClosed,
  removeLastVertex,
  ringAreaSqKm,
  type LngLat,
} from "@/lib/polygon";

describe("addVertex", () => {
  it("appends a vertex", () => {
    expect(addVertex([[0, 0]], [1, 1])).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });

  it("respects the vertex cap", () => {
    const full = Array.from({ length: 32 }, (_, i) => [i, 0] as LngLat);
    expect(addVertex(full, [99, 99])).toHaveLength(32);
  });
});

describe("removeLastVertex", () => {
  it("removes the last vertex", () => {
    expect(
      removeLastVertex([
        [0, 0],
        [1, 1],
      ]),
    ).toEqual([[0, 0]]);
  });
});

describe("isClosed", () => {
  it("reports a closed ring", () => {
    expect(
      isClosed([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ]),
    ).toBe(true);
  });

  it("reports an open ring", () => {
    expect(
      isClosed([
        [0, 0],
        [1, 0],
        [1, 1],
      ]),
    ).toBe(false);
  });

  it("requires at least three vertices", () => {
    expect(
      isClosed([
        [0, 0],
        [0, 0],
      ]),
    ).toBe(false);
  });
});

describe("closeRing", () => {
  it("appends the first point to close an open ring", () => {
    const ring = closeRing([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    expect(ring).toHaveLength(4);
    expect(isClosed(ring)).toBe(true);
  });

  it("leaves a closed ring unchanged", () => {
    const closed: LngLat[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ];
    expect(closeRing(closed)).toBe(closed);
  });

  it("leaves a degenerate polygon unchanged", () => {
    expect(closeRing([[0, 0]])).toEqual([[0, 0]]);
  });
});

describe("ringAreaSqKm", () => {
  it("approximates a ~1° box at around 7,700 km²", () => {
    const area = ringAreaSqKm([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
    expect(area).toBeGreaterThan(7000);
    expect(area).toBeLessThan(8500);
  });

  it("scales a 0.1° box down to ~77 km²", () => {
    const area = ringAreaSqKm([
      [0, 0],
      [0.1, 0],
      [0.1, 0.1],
      [0, 0.1],
    ]);
    expect(area).toBeGreaterThan(60);
    expect(area).toBeLessThan(95);
  });
});
