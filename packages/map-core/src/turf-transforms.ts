/**
 * Turf-based data transforms applied to GeoJSON before compilation.
 *
 * Each transform produces a new FeatureCollection. Transforms are applied
 * sequentially when an array is provided.
 */

import type { TransformConfig } from "@atlas/data-models";
import buffer from "@turf/buffer";
import voronoi from "@turf/voronoi";
import convex from "@turf/convex";
import centroid from "@turf/centroid";
import simplify from "@turf/simplify";
import dissolve from "@turf/dissolve";
import bbox from "@turf/bbox";
import { featureCollection } from "@turf/helpers";

/**
 * Apply one or more transforms to a GeoJSON FeatureCollection.
 * Returns the transformed data and appends any warnings.
 */
export function applyTransforms(
  data: GeoJSON.FeatureCollection,
  transforms: TransformConfig | TransformConfig[],
  warnings: string[],
): GeoJSON.FeatureCollection {
  const list = Array.isArray(transforms) ? transforms : [transforms];
  let result = data;

  for (const t of list) {
    try {
      result = applyOne(result, t);
    } catch (err) {
      warnings.push(
        `Transform "${t.type}" failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  }

  return result;
}

function applyOne(
  data: GeoJSON.FeatureCollection,
  config: TransformConfig,
): GeoJSON.FeatureCollection {
  switch (config.type) {
    case "buffer":
      return applyBuffer(data, config.distance, config.units ?? "kilometers");
    case "voronoi":
      return applyVoronoi(data, config.bbox);
    case "convex-hull":
      return applyConvexHull(data);
    case "centroid":
      return applyCentroid(data, config.keepProperties ?? true);
    case "simplify":
      return applySimplify(data, config.tolerance);
    case "dissolve":
      return applyDissolve(data, config.groupByField);
    default:
      return data;
  }
}

function applyBuffer(
  data: GeoJSON.FeatureCollection,
  distance: number,
  units: "kilometers" | "miles" | "meters",
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const f of data.features) {
    const buffered = buffer(f, distance, { units });
    if (buffered) features.push(buffered);
  }
  return featureCollection(features) as GeoJSON.FeatureCollection;
}

function applyVoronoi(
  data: GeoJSON.FeatureCollection,
  bboxOverride?: [number, number, number, number],
): GeoJSON.FeatureCollection {
  const bounds = bboxOverride ?? (bbox(data) as [number, number, number, number]);
  const result = voronoi(data as GeoJSON.FeatureCollection<GeoJSON.Point>, {
    bbox: bounds,
  });
  if (!result) return data;
  // Filter out null features
  return featureCollection(
    result.features.filter((f) => f != null),
  ) as GeoJSON.FeatureCollection;
}

function applyConvexHull(
  data: GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection {
  const hull = convex(data);
  if (!hull) return data;
  return featureCollection([hull]) as GeoJSON.FeatureCollection;
}

function applyCentroid(
  data: GeoJSON.FeatureCollection,
  keepProperties: boolean,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const f of data.features) {
    const c = centroid(f, {
      properties: keepProperties ? (f.properties ?? {}) : {},
    });
    features.push(c);
  }
  return featureCollection(features) as GeoJSON.FeatureCollection;
}

function applySimplify(
  data: GeoJSON.FeatureCollection,
  tolerance: number,
): GeoJSON.FeatureCollection {
  return simplify(data, { tolerance, highQuality: true }) as GeoJSON.FeatureCollection;
}

function applyDissolve(
  data: GeoJSON.FeatureCollection,
  groupByField: string,
): GeoJSON.FeatureCollection {
  // dissolve only works on Polygons — filter to polygon features
  const polygons = featureCollection(
    data.features.filter(
      (f) =>
        f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon",
    ),
  ) as GeoJSON.FeatureCollection<GeoJSON.Polygon>;

  if (polygons.features.length === 0) return data;
  return dissolve(polygons, { propertyName: groupByField }) as GeoJSON.FeatureCollection;
}
