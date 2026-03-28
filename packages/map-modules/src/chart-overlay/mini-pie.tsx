import { getColors } from "@atlas/data-models";

/** SVG mini pie chart rendered at a map feature centroid. */
export function MiniPie({
  values,
  labels,
  size = 40,
}: {
  values: number[];
  labels?: string[];
  size?: number;
}) {
  if (values.length === 0) return null;
  const total = values.reduce((s, v) => s + Math.max(v, 0), 0);
  if (total === 0) return null;

  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const colors = getColors("set2", values.length);

  let startAngle = -Math.PI / 2;
  const slices: Array<{ path: string; color: string; title?: string }> = [];

  for (let i = 0; i < values.length; i++) {
    const v = Math.max(values[i], 0);
    const angle = (v / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    slices.push({ path, color: colors[i], title: labels?.[i] ? `${labels[i]}: ${v}` : undefined });
    startAngle = endAngle;
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((s, i) => (
        <path key={i} d={s.path} fill={s.color}>
          {s.title && <title>{s.title}</title>}
        </path>
      ))}
    </svg>
  );
}
