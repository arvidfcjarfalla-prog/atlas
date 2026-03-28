import { getColors } from "@atlas/data-models";

/** SVG mini bar chart rendered at a map feature centroid. */
export function MiniBar({
  values,
  labels,
  size = 40,
}: {
  values: number[];
  labels?: string[];
  size?: number;
}) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const barWidth = size / values.length;
  const colors = getColors("set2", values.length);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {values.map((v, i) => {
        const h = (v / max) * (size - 4);
        return (
          <rect
            key={i}
            x={i * barWidth + 1}
            y={size - h - 2}
            width={barWidth - 2}
            height={h}
            fill={colors[i]}
            rx={1}
          >
            {labels?.[i] && <title>{`${labels[i]}: ${v}`}</title>}
          </rect>
        );
      })}
    </svg>
  );
}
