export interface ChartDatum {
  label: string;
  value: number;
}

const ACCENT = "var(--accent)";
const MUTED = "var(--muted)";
const LINE = "var(--line)";

const LABEL_FONT = 11;

function maxOf(data: ChartDatum[]): number {
  return Math.max(1, ...data.map((d) => d.value));
}

function slotOf(data: ChartDatum[], width: number): number {
  return width / Math.max(1, data.length);
}

/** Pure geometry: bars scaled to [0, height] with a 4px baseline gutter. */
export function buildBarPoints(
  data: ChartDatum[],
  width: number,
  height: number,
): Array<{ x: number; y: number; h: number }> {
  const max = maxOf(data);
  const slot = slotOf(data, width);
  const inner = height - 8;
  return data.map((d, i) => ({
    x: i * slot + slot * 0.15,
    y: height - (d.value / max) * inner - 4,
    h: Math.max(2, (d.value / max) * inner),
  }));
}

/** Pure geometry: point positions for a polyline, centered in each slot. */
export function buildLinePoints(
  data: ChartDatum[],
  width: number,
  height: number,
): Array<{ x: number; y: number }> {
  const max = maxOf(data);
  const slot = slotOf(data, width);
  const inner = height - 8;
  return data.map((d, i) => ({
    x: i * slot + slot / 2,
    y: height - (d.value / max) * inner - 4,
  }));
}

function truncate(label: string, max = 9): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function Gridlines({ width, height, max }: { width: number; height: number; max: number }) {
  return (
    <g aria-hidden>
      {[0.25, 0.5, 0.75].map((f) => {
        const y = height - 4 - f * (height - 8);
        return (
          <g key={f}>
            <line x1={0} y1={y} x2={width} y2={y} stroke={LINE} strokeWidth={1} strokeDasharray="3 4" />
            <text x={width - 4} y={y - 3} textAnchor="end" fontSize={LABEL_FONT - 2} fill={MUTED}>
              {Math.round(max * f)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function HiddenTable({ data, label }: { data: ChartDatum[]; label: string }) {
  return (
    <table className="sr-only">
      <caption>{label}</caption>
      <thead>
        <tr>
          <th scope="col">Label</th>
          <th scope="col">Count</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.label}>
            <th scope="row">{d.label}</th>
            <td>{d.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyNote() {
  return <p className="py-8 text-center text-sm text-muted">No records in this period yet.</p>;
}

export function BarChart({
  data,
  height = 160,
  label = "Bar chart",
}: {
  data: ChartDatum[];
  height?: number;
  label?: string;
}) {
  const width = 560;
  const axisHeight = 18;
  const totalHeight = height + axisHeight;
  const slot = slotOf(data, width);
  const bars = buildBarPoints(data, width, height);
  const max = maxOf(data);
  if (data.length === 0 || data.every((d) => d.value === 0)) return <EmptyNote />;
  return (
    <figure className="w-full">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${width} ${totalHeight}`}
        className="h-auto w-full"
      >
        <Gridlines width={width} height={height} max={max} />
        <line x1={0} y1={height - 4} x2={width} y2={height - 4} stroke={LINE} strokeWidth={1} />
        {bars.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={b.y} width={slot * 0.7} height={b.h} fill={ACCENT} rx={1.5} />
            <text
              x={b.x + (slot * 0.7) / 2}
              y={b.y - 4}
              textAnchor="middle"
              fontSize={LABEL_FONT}
              fill={MUTED}
            >
              {data[i]?.value ?? 0}
            </text>
            <text
              x={b.x + (slot * 0.7) / 2}
              y={height + axisHeight - 4}
              textAnchor="middle"
              fontSize={LABEL_FONT}
              fill={MUTED}
            >
              {truncate(data[i]?.label ?? "")}
            </text>
          </g>
        ))}
      </svg>
      <HiddenTable data={data} label={label} />
    </figure>
  );
}

export function LineChart({
  data,
  height = 160,
  label = "Line chart",
}: {
  data: ChartDatum[];
  height?: number;
  label?: string;
}) {
  const width = 560;
  const axisHeight = 18;
  const totalHeight = height + axisHeight;
  const points = buildLinePoints(data, width, height);
  const joined = points.map((p) => `${p.x},${p.y}`).join(" ");
  const max = maxOf(data);
  if (data.length === 0 || data.every((d) => d.value === 0)) return <EmptyNote />;
  const firstLabel = data[0]?.label ?? "";
  const lastLabel = data[data.length - 1]?.label ?? "";
  return (
    <figure className="w-full">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${width} ${totalHeight}`}
        className="h-auto w-full"
      >
        <Gridlines width={width} height={height} max={max} />
        <line x1={0} y1={height - 4} x2={width} y2={height - 4} stroke={LINE} strokeWidth={1} />
        {points.length > 1 ? (
          <polyline points={joined} fill="none" stroke={ACCENT} strokeWidth={2} />
        ) : null}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={ACCENT} />
        ))}
        <text x={points[0]?.x ?? 0} y={height + axisHeight - 4} textAnchor="start" fontSize={LABEL_FONT} fill={MUTED}>
          {truncate(firstLabel, 12)}
        </text>
        {points.length > 1 ? (
          <text
            x={points[points.length - 1]?.x ?? width}
            y={height + axisHeight - 4}
            textAnchor="end"
            fontSize={LABEL_FONT}
            fill={MUTED}
          >
            {truncate(lastLabel, 12)}
          </text>
        ) : null}
      </svg>
      <HiddenTable data={data} label={label} />
    </figure>
  );
}
