export interface PieSlice {
  /** SVG `d` attribute for the slice path. */
  path: string;
  /** Original index in the input `values` array — use to look up color/label. */
  index: number;
  /** Value after negative-clamp. */
  value: number;
  /** Largest-arc flag the SVG A-command used (0 or 1). */
  largeArc: 0 | 1;
}

/**
 * Compute SVG path strings for a pie chart of `values` rendered inside an
 * `size`×`size` viewBox. Negative values are clamped to 0. Returns an empty
 * array if there is nothing to draw (empty input or total ≤ 0).
 *
 * Starting angle is -π/2 (12 o'clock) and slices wind clockwise. One entry
 * is produced per input value, in order, including zero-value slices (which
 * render as zero-length paths — matches the legacy inline rendering).
 */
export function computePieSlices(values: number[], size: number): PieSlice[] {
  if (values.length === 0) return [];
  const total = values.reduce((s, v) => s + Math.max(v, 0), 0);
  if (total <= 0) return [];

  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;

  const slices: PieSlice[] = [];
  let startAngle = -Math.PI / 2;

  for (let i = 0; i < values.length; i++) {
    const v = Math.max(values[i], 0);
    const angle = (v / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc: 0 | 1 = angle > Math.PI ? 1 : 0;

    slices.push({
      path: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      index: i,
      value: v,
      largeArc,
    });
    startAngle = endAngle;
  }

  return slices;
}
