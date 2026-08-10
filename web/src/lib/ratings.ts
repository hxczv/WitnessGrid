export type RatingAxis = "appropriateness" | "professionalism" | "safety";

export interface RatingScores {
  appropriateness: number;
  professionalism: number;
  safety: number;
}

export function buildScores(
  axis: RatingAxis,
  value: number,
  existing: RatingScores | null | undefined,
): RatingScores {
  return {
    appropriateness: axis === "appropriateness" ? value : (existing?.appropriateness ?? 3),
    professionalism: axis === "professionalism" ? value : (existing?.professionalism ?? 3),
    safety: axis === "safety" ? value : (existing?.safety ?? 3),
  };
}
