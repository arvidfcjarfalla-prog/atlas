/**
 * Overpass API helper for querying OpenStreetMap data.
 *
 * Builds Overpass QL queries for common patterns (amenities, boundaries,
 * natural features) and returns GeoJSON FeatureCollections.
 *
 * Rate limits: Overpass public API allows ~10k requests/day.
 * We cache results for 1 hour to be conservative.
 */

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const TIMEOUT = 15; // seconds
const MAX_FEATURES = 500;

// ─── Cache ──────────────────────────────────────────────────

interface CacheEntry {
  data: GeoJSON.FeatureCollection;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCached(key: string): GeoJSON.FeatureCollection | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

// ─── Query builder ──────────────────────────────────────────

export interface OverpassQuery {
  /** OSM tag key (e.g. "amenity", "natural", "tourism"). */
  key: string;
  /** OSM tag value (e.g. "restaurant", "peak", "hotel"). */
  value: string;
  /** Bounding box [south, west, north, east]. */
  bbox: [number, number, number, number];
}

function buildQL(query: OverpassQuery): string {
  const { key, value, bbox } = query;
  const [s, w, n, e] = bbox;
  return `[out:json][timeout:${TIMEOUT}];
node["${key}"="${value}"](${s},${w},${n},${e});
out center ${MAX_FEATURES};`;
}

// ─── Query execution ────────────────────────────────────────

/**
 * Query Overpass API and return GeoJSON.
 * Returns null if the query fails or returns no results.
 */
export async function queryOverpass(
  query: OverpassQuery,
): Promise<GeoJSON.FeatureCollection | null> {
  const ql = buildQL(query);
  const cacheKey = ql;

  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(ql)}`,
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const elements = data.elements as Array<{
      type: string;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }>;

    if (!elements || elements.length === 0) return null;

    const features: GeoJSON.Feature[] = elements
      .filter((el) => {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        return lat != null && lon != null;
      })
      .map((el, i) => {
        const lat = el.lat ?? el.center?.lat ?? 0;
        const lon = el.lon ?? el.center?.lon ?? 0;
        const tags = el.tags ?? {};
        return {
          type: "Feature" as const,
          id: i,
          geometry: {
            type: "Point" as const,
            coordinates: [lon, lat],
          },
          properties: {
            name: tags.name ?? "",
            type: tags[query.key] ?? query.value,
            ...tags,
          },
        };
      });

    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features,
    };

    cache.set(cacheKey, { data: fc, timestamp: Date.now() });

    return fc;
  } catch {
    return null;
  }
}

// ─── Common amenity mappings ────────────────────────────────

/**
 * Map common user terms to Overpass tag queries.
 * Returns null if no mapping is found.
 */
export function resolveAmenityQuery(
  term: string,
  bbox: [number, number, number, number],
): OverpassQuery | null {
  const lower = term.toLowerCase();

  const MAPPINGS: Record<string, { key: string; value: string }> = {
    restaurant: { key: "amenity", value: "restaurant" },
    restaurang: { key: "amenity", value: "restaurant" },
    café: { key: "amenity", value: "cafe" },
    cafe: { key: "amenity", value: "cafe" },
    kafé: { key: "amenity", value: "cafe" },
    bar: { key: "amenity", value: "bar" },
    pub: { key: "amenity", value: "pub" },
    hospital: { key: "amenity", value: "hospital" },
    sjukhus: { key: "amenity", value: "hospital" },
    school: { key: "amenity", value: "school" },
    skola: { key: "amenity", value: "school" },
    pharmacy: { key: "amenity", value: "pharmacy" },
    apotek: { key: "amenity", value: "pharmacy" },
    park: { key: "leisure", value: "park" },
    hotel: { key: "tourism", value: "hotel" },
    hotell: { key: "tourism", value: "hotel" },
    museum: { key: "tourism", value: "museum" },
    supermarket: { key: "shop", value: "supermarket" },
    library: { key: "amenity", value: "library" },
    bibliotek: { key: "amenity", value: "library" },
    gym: { key: "leisure", value: "fitness_centre" },
    cinema: { key: "amenity", value: "cinema" },
    biograf: { key: "amenity", value: "cinema" },
    church: { key: "amenity", value: "place_of_worship" },
    kyrka: { key: "amenity", value: "place_of_worship" },
    station: { key: "railway", value: "station" },
    tågstation: { key: "railway", value: "station" },
    airport: { key: "aeroway", value: "aerodrome" },
    flygplats: { key: "aeroway", value: "aerodrome" },
    parking: { key: "amenity", value: "parking" },
    parkering: { key: "amenity", value: "parking" },
    charging: { key: "amenity", value: "charging_station" },
    laddstation: { key: "amenity", value: "charging_station" },
  };

  for (const [keyword, tags] of Object.entries(MAPPINGS)) {
    if (lower.includes(keyword)) {
      return { ...tags, bbox };
    }
  }

  return null;
}
