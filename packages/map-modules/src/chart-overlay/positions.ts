/** Minimal map interface for projection — avoids maplibre-gl dependency. */
export interface MapLike {
  getZoom(): number;
  getBounds(): { contains(lnglat: [number, number]): boolean };
  project(lnglat: [number, number]): { x: number; y: number };
  on(type: string, fn: () => void): void;
  off(type: string, fn: () => void): void;
}

export interface FeaturePosition {
  x: number;
  y: number;
  /** Index into the input `features` array. */
  idx: number;
}

export interface ProjectableFeature {
  centroid: [number, number];
}

/**
 * Project feature centroids to screen pixels, filtered by bounds and clamped
 * to `maxVisible`. Returns `[]` if the map zoom is below `minZoom`.
 *
 * Preserves feature order and original indices for downstream lookup.
 */
export function computeVisiblePositions(
  map: Pick<MapLike, "getZoom" | "getBounds" | "project">,
  features: ProjectableFeature[],
  minZoom: number,
  maxVisible: number,
): FeaturePosition[] {
  if (map.getZoom() < minZoom) return [];

  const bounds = map.getBounds();
  const visible: FeaturePosition[] = [];

  for (let i = 0; i < features.length && visible.length < maxVisible; i++) {
    const [lng, lat] = features[i].centroid;
    if (!bounds.contains([lng, lat])) continue;
    const point = map.project([lng, lat]);
    visible.push({ x: point.x, y: point.y, idx: i });
  }

  return visible;
}
