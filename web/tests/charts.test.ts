import { describe, expect, it } from "vitest";
import { buildBarPoints, buildLinePoints } from "@/components/charts";

describe("buildBarPoints", () => {
  it("returns an empty array for no data", () => {
    expect(buildBarPoints([], 560, 160)).toEqual([]);
  });

  it("scales the single max value to touch the top of the plot area", () => {
    const bar = buildBarPoints([{ label: "a", value: 9 }], 100, 100)[0]!;
    expect(bar.y).toBe(4);
    expect(bar.h).toBe(92);
  });

  it("produces proportional heights across values", () => {
    const bars = buildBarPoints(
      [
        { label: "a", value: 10 },
        { label: "b", value: 5 },
        { label: "c", value: 2.5 },
      ],
      300,
      100,
    );
    expect(bars[0]!.h).toBe(92);
    expect(bars[1]!.h).toBe(46);
    expect(bars[2]!.h).toBeCloseTo(23, 5);
  });

  it("spaces bars evenly across the width", () => {
    const bars = buildBarPoints(
      [
        { label: "a", value: 1 },
        { label: "b", value: 1 },
        { label: "c", value: 1 },
        { label: "d", value: 1 },
      ],
      400,
      100,
    );
    expect(bars[0]!.x).toBe(15);
    expect(bars[1]!.x).toBe(115);
    expect(bars[2]!.x).toBe(215);
    expect(bars[3]!.x).toBe(315);
  });
});

describe("buildLinePoints", () => {
  it("returns an empty array for no data", () => {
    expect(buildLinePoints([], 560, 160)).toEqual([]);
  });

  it("places the max value at the top of the plot area", () => {
    const point = buildLinePoints([{ label: "a", value: 9 }], 100, 100)[0]!;
    expect(point.y).toBe(4);
  });

  it("centers points in their slots", () => {
    const points = buildLinePoints(
      [
        { label: "a", value: 1 },
        { label: "b", value: 1 },
      ],
      200,
      100,
    );
    expect(points[0]!.x).toBe(50);
    expect(points[1]!.x).toBe(150);
  });

  it("scales mid values proportionally", () => {
    const points = buildLinePoints(
      [
        { label: "a", value: 10 },
        { label: "b", value: 5 },
      ],
      200,
      100,
    );
    expect(points[1]!.y).toBe(50);
  });
});
