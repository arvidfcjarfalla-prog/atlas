import { getColors } from "@atlas/data-models";

/** SVG mini sparkline rendered at a map feature centroid. */
export function MiniSparkline({
  values,
  size = 40,
}: {
  values: number[];
  size?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const color = getColors("blues", 1)[0];

  const padding = 3;
  const w = size - padding * 2;
  const h = size - padding * 2;
  const step = w / (values.length - 1);

  const points = values.map((v, i) => {
    const x = padding + i * step;
    const y = padding + h - ((v - min) / range) * h;
    return `${x},${y}`;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
