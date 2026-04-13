import { getColors } from "@atlas/data-models";
import { computePieSlices } from "./pie-slices";

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
  const slices = computePieSlices(values, size);
  if (slices.length === 0) return null;

  const colors = getColors("set2", values.length);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((s) => {
        const label = labels?.[s.index];
        return (
          <path key={s.index} d={s.path} fill={colors[s.index]}>
            {label && <title>{`${label}: ${s.value}`}</title>}
          </path>
        );
      })}
    </svg>
  );
}
