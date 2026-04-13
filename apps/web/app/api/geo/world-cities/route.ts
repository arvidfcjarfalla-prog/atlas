import { readFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

/**
 * Serve Natural Earth populated places as GeoJSON.
 *
 * Uses the "simple" dataset (~240 major cities worldwide).
 * Vendored in the repo and normalised at request/build time.
 *
 * Attributes per feature:
 *   name, country, continent, pop_max, pop_min, latitude, longitude, capital
 */

const CITIES_DATA_FILE = join(process.cwd(), "public/geo/vendor/world-cities.geojson");
const COUNTRIES_DATA_FILE = join(process.cwd(), "public/geo/vendor/world-countries.geojson");
let cache: { data: GeoJSON.FeatureCollection; timestamp: number } | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_CONTROL = "public, s-maxage=86400, stale-while-revalidate=172800";

function jsonWithCache(
  data: GeoJSON.FeatureCollection,
  cacheControl = CACHE_CONTROL,
): NextResponse {
  return NextResponse.json(data, {
    headers: { "Cache-Control": cacheControl },
  });
}

function normalizeLookupKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function buildContinentIndex(raw: GeoJSON.FeatureCollection): Map<string, string> {
  const index = new Map<string, string>();

  for (const feature of raw.features) {
    const properties = feature.properties ?? {};
    const continent = properties["CONTINENT"] ?? properties["continent"];
    if (typeof continent !== "string" || continent.trim().length === 0) continue;

    const keys = [
      properties["ISO_A2_EH"],
      properties["ISO_A2"],
      properties["ISO_A3_EH"],
      properties["ISO_A3"],
      properties["ADM0_A3"],
      properties["NAME"],
      properties["NAME_LONG"],
      properties["name"],
    ];

    for (const key of keys) {
      const normalized = normalizeLookupKey(key);
      if (normalized) {
        index.set(normalized, continent);
      }
    }
  }

  return index;
}

function lookupContinent(
  index: Map<string, string>,
  ...candidates: unknown[]
): string {
  for (const candidate of candidates) {
    const normalized = normalizeLookupKey(candidate);
    if (!normalized) continue;

    const continent = index.get(normalized);
    if (continent) return continent;
  }

  return "";
}

export async function GET(): Promise<NextResponse> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return jsonWithCache(cache.data);
  }

  try {
    const [rawCities, rawCountries] = await Promise.all([
      readFile(CITIES_DATA_FILE, "utf8"),
      readFile(COUNTRIES_DATA_FILE, "utf8"),
    ]);

    const cities = JSON.parse(rawCities) as GeoJSON.FeatureCollection;
    const countries = JSON.parse(rawCountries) as GeoJSON.FeatureCollection;
    const continentIndex = buildContinentIndex(countries);

    // Normalise to a slim set of attributes
    const features: GeoJSON.Feature[] = cities.features.map((f) => {
      const p = f.properties ?? {};
      const country = p["adm0name"] ?? p["ADM0NAME"] ?? "";

      return {
        type: "Feature" as const,
        geometry: f.geometry,
        properties: {
          name: p["name"] ?? p["NAME"] ?? "",
          country,
          continent: lookupContinent(
            continentIndex,
            p["adm0_a3"],
            p["ADM0_A3"],
            p["iso_a2"],
            p["ISO_A2"],
            country,
          ),
          pop_max: Number(p["pop_max"] ?? p["POP_MAX"] ?? 0),
          pop_min: Number(p["pop_min"] ?? p["POP_MIN"] ?? 0),
          latitude: Number(p["latitude"] ?? p["LATITUDE"] ?? 0),
          longitude: Number(p["longitude"] ?? p["LONGITUDE"] ?? 0),
          capital: Number(String(p["featurecla"] ?? "").toLowerCase().includes("capital")),
        },
      };
    });

    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features,
    };

    cache = { data: fc, timestamp: Date.now() };

    return jsonWithCache(fc);
  } catch {
    if (cache) {
      return jsonWithCache(cache.data);
    }
    return NextResponse.json(
      { error: "City data unavailable" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
