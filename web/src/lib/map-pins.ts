import type { ExpressionSpecification, Map } from "maplibre-gl";
import { INCIDENT_TYPES, type IncidentType } from "@/lib/contract";

// Teardrop pin geometry, in logical pixels. The same ratios feed the cluster
// count text offsets so the number always lands on the pin head.
const PIN_W = 22;
const PIN_H = 30;
const HEAD_CY = 0.42; // head centre as a fraction of height from the top
const HEAD_R = 0.3; // head radius as a fraction of width
const ATTACH_ANGLE = Math.PI * 1.25; // 225°: left attachment (down-left)
const TIP_TAPER = 1.9; // control-point depth below the head centre

// Tuned for the dark CARTO basemap: bright, distinct per type.
export const PIN_TYPE_COLORS: Record<IncidentType, string> = {
  stop_and_search: "#FFB300",
  vehicle_stop: "#4FC3F7",
  use_of_force: "#FF8A65",
  missing_person: "#CE93D8",
  arrest: "#E57373",
  traffic_collision: "#81C784",
  stop_and_question: "#90A4AE",
  other: "#E8A33D",
};

export interface ClusterTier {
  min: number;
  size: number;
}

// Cluster pins grow by count; the icon-image stop bands must match these.
export const CLUSTER_TIERS: ClusterTier[] = [
  { min: 0, size: 34 },
  { min: 10, size: 42 },
  { min: 25, size: 52 },
];

export function pinImageId(type: IncidentType): string {
  return `pin-${type}`;
}

export function clusterImageId(size: number): string {
  return `cluster-pin-${size}`;
}

/** Pixels from the tip up to the head centre — used for count text offsets. */
export function headCenterFromTip(size: number): number {
  return size * (1 - HEAD_CY);
}

function teardropPath(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2;
  const cy = h * HEAD_CY;
  const r = w * HEAD_R;
  const a1 = ATTACH_ANGLE; // 225°
  const a2 = Math.PI * 1.75; // 315°
  const left = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)] as const;
  const right = [cx + r * Math.cos(a2), cy + r * Math.sin(a2)] as const;
  // Arc from the right attachment over the top to the left one.
  ctx.beginPath();
  ctx.arc(cx, cy, r, a2, a1, true);
  // Taper each side of the head down to the bottom tip.
  ctx.quadraticCurveTo(cx - r * TIP_TAPER, cy + r * TIP_TAPER, cx, h - 0.5);
  ctx.quadraticCurveTo(cx + r * TIP_TAPER, cy + r * TIP_TAPER, right[0], right[1]);
  ctx.closePath();
}

const DPR = 2; // draw at 2x so pins stay crisp on hi-DPI screens

function makePinImage(w: number, h: number, fill: string, outline: string): { width: number; height: number; data: Uint8ClampedArray; pixelRatio: number } {
  const canvas = document.createElement("canvas");
  canvas.width = w * DPR;
  canvas.height = h * DPR;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  ctx.scale(DPR, DPR);
  teardropPath(ctx, w, h);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = outline;
  ctx.stroke();
  return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, pixelRatio: DPR };
}

/** Register one pin image per incident type plus the cluster tiers. */
export function registerPinImages(
  map: Map,
  opts: { accent: string; outline: string },
): void {
  for (const type of INCIDENT_TYPES) {
    map.addImage(pinImageId(type), makePinImage(PIN_W, PIN_H, PIN_TYPE_COLORS[type], opts.outline));
  }
  for (const tier of CLUSTER_TIERS) {
    map.addImage(clusterImageId(tier.size), makePinImage(tier.size * (PIN_W / PIN_H), tier.size, opts.accent, opts.outline));
  }
}

/**
 * maplibre expression mapping an incident's `incident_type` to its pin image.
 * Falls back to `other` for unknown values.
 */
export function pinImageExpression(): ExpressionSpecification {
  const expr: unknown[] = ["match", ["get", "incident_type"]];
  for (const type of INCIDENT_TYPES) {
    expr.push(type, pinImageId(type));
  }
  expr.push(pinImageId("other"));
  return expr as ExpressionSpecification;
}

/** maplibre expression sizing cluster pins by count band. */
export function clusterImageExpression(): ExpressionSpecification {
  // ["step", input, output0, stop1, output1, ..., stopN, outputN]
  const expr: unknown[] = ["step", ["get", "point_count"], clusterImageId(CLUSTER_TIERS[0]!.size)];
  for (const tier of CLUSTER_TIERS.slice(1)) {
    expr.push(tier.min, clusterImageId(tier.size));
  }
  return expr as ExpressionSpecification;
}

/** per-tier text offset (em, negative = up) that centres the count on the head. */
export function clusterTextOffsetExpression(): ExpressionSpecification {
  const expr: unknown[] = [
    "step",
    ["get", "point_count"],
    ["literal", [0, -headCenterFromTip(CLUSTER_TIERS[0]!.size) / 11]],
  ];
  for (const tier of CLUSTER_TIERS.slice(1)) {
    expr.push(tier.min, ["literal", [0, -headCenterFromTip(tier.size) / 11]]);
  }
  return expr as ExpressionSpecification;
}