import { describe, expect, it } from "vitest";
import { buildScores } from "@/lib/ratings";

describe("buildScores", () => {
  it("sets only the chosen axis on a first rating, neutral default for the rest", () => {
    expect(buildScores("appropriateness", 4, null)).toEqual({
      appropriateness: 4,
      professionalism: 3,
      safety: 3,
    });
  });

  it("keeps existing values on the other axes when updating one", () => {
    expect(
      buildScores("safety", 2, { appropriateness: 5, professionalism: 1, safety: 4 }),
    ).toEqual({ appropriateness: 5, professionalism: 1, safety: 2 });
  });
});
