export interface ChartDatum {
  label: string;
  value: number;
}

const AMBER = "#E8A33D";
const BASELINE = "var(--line)";

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
  const slot = slotOf(data, width);
  const bars = buildBarPoints(data, width, height);
  return (
    <figure className="w-full">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
      >
        <line x1={0} y1={height - 4} x2={width} y2={height - 4} stroke={BASELINE} strokeWidth={1} />
        {bars.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={slot * 0.7} height={b.h} fill={AMBER} />
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
  const points = buildLinePoints(data, width, height);
  const joined = points.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <figure className="w-full">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
      >
        <line x1={0} y1={height - 4} x2={width} y2={height - 4} stroke={BASELINE} strokeWidth={1} />
        {points.length > 1 ? (
          <polyline points={joined} fill="none" stroke={AMBER} strokeWidth={2} />
        ) : null}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={AMBER} />
        ))}
      </svg>
      <HiddenTable data={data} label={label} />
    </figure>
  );
}
