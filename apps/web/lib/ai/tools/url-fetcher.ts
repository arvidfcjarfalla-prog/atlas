/**
 * Shared URL fetching + SSRF validation.
 *
 * Extracted from generate-map/route.ts and web-dataset-search.ts so both
 * the generate pipeline and the agent chat can reuse the same logic.
 */

import { profileDataset } from "../profiler";
import {
  setCache,
  type CacheEntry,
} from "./data-search";
import {
  parseCSV,
  detectLatLngColumns,
  detectCountryColumn,
  csvToPointFeatures,
} from "./web-dataset-search";
import { csvToGeoFeatures } from "../csv-geo-resolver";
import type { DatasetProfile } from "../types";

// ─── Constants ──────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 15_000;
const MAX_CSV_ROWS = 10_000;
const MAX_GEOJSON_FEATURES = 50_000;

// ─── SSRF validation ────────────────────────────────────────

/**
 * Validate a URL to prevent SSRF attacks.
 * Blocks private/loopback/link-local IPs, non-http(s) schemes, and AWS metadata.
 */
export function validateFetchUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }

  const hostname = parsed.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.startsWith("127.")
  ) {
    throw new Error("Loopback addresses are not allowed");
  }

  const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipMatch) {
    const [, a, b] = ipMatch.map(Number);
    if (
      a === 10 ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    ) {
      throw new Error("Private and link-local addresses are not allowed");
    }
  }

  return parsed;
}

// ─── Fetch + parse a URL into GeoJSON ───────────────────────

export interface FetchResult {
  fc: GeoJSON.FeatureCollection;
  profile: DatasetProfile;
  description: string;
}

/**
 * Fetch a URL, detect format (GeoJSON or CSV), convert to GeoJSON,
 * profile, and optionally cache it.
 *
 * Returns null if the URL doesn't contain usable geographic data.
 */
export async function fetchAndParse(
  url: string,
  opts?: { cacheKey?: string; countryHint?: string },
): Promise<FetchResult | null> {
  validateFetchUrl(url);

  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;

  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();

  let fc: GeoJSON.FeatureCollection | null = null;
  let description = url.split("/").pop() ?? "dataset";

  // Try GeoJSON
  if (
    contentType.includes("json") ||
    url.endsWith(".geojson") ||
    url.endsWith(".json")
  ) {
    try {
      const data = JSON.parse(text);
      if (data?.type === "FeatureCollection" && Array.isArray(data.features)) {
        fc = data as GeoJSON.FeatureCollection;
        if (fc.features.length > MAX_GEOJSON_FEATURES) {
          fc.features = fc.features.slice(0, MAX_GEOJSON_FEATURES);
        }
        description = `GeoJSON (${fc.features.length} features)`;
      }
    } catch {
      // Not valid JSON — fall through to CSV
    }
  }

  // Try CSV
  if (
    !fc &&
    (contentType.includes("csv") ||
      contentType.includes("text/plain") ||
      url.endsWith(".csv"))
  ) {
    const rows = parseCSV(text);
    if (rows.length > 0) {
      const headers = Object.keys(rows[0]);
      const latLng = detectLatLngColumns(headers);
      if (latLng) {
        fc = csvToPointFeatures(
          rows.slice(0, MAX_CSV_ROWS),
          latLng.lat,
          latLng.lng,
        );
        description = `CSV → Points (${fc.features.length} features)`;
      } else {
        const countryCol = detectCountryColumn(headers);
        if (countryCol || opts?.countryHint) {
          try {
            const geoResult = await csvToGeoFeatures(
              text,
              opts?.countryHint,
            );
            if (geoResult.features && geoResult.features.features.length > 0) {
              fc = geoResult.features;
              description = `CSV → ${geoResult.geoType ?? "regions"} (${fc.features.length} features)`;
            }
          } catch {
            // Pipeline failed
          }
        }
      }
    }
  }

  if (!fc || fc.features.length === 0) return null;

  const profile = profileDataset(fc);

  // Cache if key provided
  if (opts?.cacheKey) {
    const entry: CacheEntry = {
      data: fc,
      profile,
      source: "URL fetch",
      description,
      timestamp: Date.now(),
    };
    await setCache(opts.cacheKey, entry).catch(() => {});
  }

  return { fc, profile, description };
}
