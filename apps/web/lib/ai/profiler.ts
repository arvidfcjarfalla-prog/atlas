import type {
  DatasetProfile,
  AttributeProfile,
  ProfileGeometryType,
  DistributionShape,
} from "./types";

interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: string; coordinates?: unknown } | null;
    properties: Record<string, unknown> | null;
  }>;
}

/**
 * Profile a GeoJSON FeatureCollection to extract metadata
 * that guides map type selection and styling.
 *
 * Designed to run server-side on datasets up to ~50k features.
 * For larger datasets, pass a pre-computed profile instead.
 */
export function profileDataset(geojson: GeoJSONFeatureCollection): DatasetProfile {
  const features = geojson.features ?? [];
  const featureCount = features.length;

  // Geometry type detection
  const geomTypes = new Set<string>();
  let south = 90, west = 180, north = -90, east = -180;

  for (const f of features) {
    if (!f.geometry) continue;
    geomTypes.add(f.geometry.type);
    extractBounds(f.geometry.coordinates, (lng, lat) => {
      if (lat < south) south = lat;
      if (lat > north) north = lat;
      if (lng < west) west = lng;
      if (lng > east) east = lng;
    });
  }

  const geometryType = resolveGeometryType(geomTypes);

  // Attribute profiling — sample up to 5000 features for speed
  const sampleSize = Math.min(features.length, 5000);
  const sample = features.slice(0, sampleSize);
  const attributes = profileAttributes(sample, sampleSize);

  return {
    featureCount,
    geometryType,
    bounds: [
      [south, west],
      [north, east],
    ],
    crs: null, // GeoJSON is always WGS84 (EPSG:4326)
    attributes,
  };
}

function resolveGeometryType(types: Set<string>): ProfileGeometryType {
  if (types.size === 0) return "Point";
  if (types.size === 1) {
    const t = [...types][0];
    if (t === "Point" || t === "MultiPoint") return t as ProfileGeometryType;
    if (t === "LineString" || t === "MultiLineString") return t as ProfileGeometryType;
    if (t === "Polygon") return "Polygon";
    if (t === "MultiPolygon") return "MultiPolygon";
  }
  return "Mixed";
}

/**
 * Walk coordinate arrays recursively to extract lng/lat pairs.
 * Works for all GeoJSON geometry types.
 */
function extractBounds(
  coords: unknown,
  cb: (lng: number, lat: number) => void,
): void {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    cb(coords[0] as number, coords[1] as number);
    return;
  }
  for (const child of coords) {
    extractBounds(child, cb);
  }
}

function profileAttributes(
  features: GeoJSONFeatureCollection["features"],
  sampleSize: number,
): AttributeProfile[] {
  if (features.length === 0) return [];

  // Collect all attribute names from first 100 features
  const nameSet = new Set<string>();
  for (let i = 0; i < Math.min(features.length, 100); i++) {
    const props = features[i].properties;
    if (props) {
      for (const key of Object.keys(props)) {
        nameSet.add(key);
      }
    }
  }

  const names = [...nameSet];
  const profiles: AttributeProfile[] = [];

  for (const name of names) {
    const values: unknown[] = [];
    let nullCount = 0;

    for (const f of features) {
      const v = f.properties?.[name];
      if (v === null || v === undefined) {
        nullCount++;
      } else {
        values.push(v);
      }
    }

    const type = detectType(values);
    const uniqueValues = new Set(values.map(String)).size;

    const profile: AttributeProfile = {
      name,
      type,
      uniqueValues,
      nullCount,
    };

    if (type === "number") {
      const nums = values.filter((v) => typeof v === "number") as number[];
      if (nums.length > 0) {
        nums.sort((a, b) => a - b);
        profile.min = nums[0];
        profile.max = nums[nums.length - 1];
        profile.mean = Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100;
        profile.median = nums[Math.floor(nums.length / 2)];
        profile.distribution = detectDistribution(nums);
      }
    }

    if (type === "string") {
      const strs = values.filter((v) => typeof v === "string") as string[];
      profile.sampleValues = [...new Set(strs)].slice(0, 5);
    }

    profiles.push(profile);
  }

  return profiles;
}

function detectType(values: unknown[]): "string" | "number" | "boolean" | "null" {
  if (values.length === 0) return "null";
  const types = new Set(values.map((v) => typeof v));
  if (types.has("number")) return "number";
  if (types.has("boolean")) return "boolean";
  return "string";
}

/**
 * Simple skewness estimation using Pearson's second coefficient.
 * skewness = 3 * (mean - median) / stddev
 */
function detectDistribution(sorted: number[]): DistributionShape {
  if (sorted.length < 10) return "uniform";

  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const median = sorted[Math.floor(n / 2)];
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);

  if (stddev === 0) return "uniform";

  const skewness = (3 * (mean - median)) / stddev;

  if (skewness > 0.5) return "skewed-right";
  if (skewness < -0.5) return "skewed-left";
  return "normal";
}
