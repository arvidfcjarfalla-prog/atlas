import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UNESCO_API =
  "https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/records?limit=100&offset=";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_CONTROL = "public, s-maxage=86400, stale-while-revalidate=172800";

let cache: { data: GeoJSON.FeatureCollection; timestamp: number } | null = null;

interface UnescoRecord {
  name_en: string;
  category: string;
  region: string;
  states_names: string[];
  iso_codes: string[];
  date_inscribed: string;
  danger: boolean;
  area_hectares: number | null;
  coordinates: { lat: number; lon: number } | null;
}

/**
 * GET /api/heritage
 *
 * Returns UNESCO World Heritage Sites as GeoJSON.
 * Fetches all ~1248 sites via paginated API calls.
 * Uses runtime caching for 24 hours (dataset changes rarely).
 */
export async function GET() {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  }

  try {
    const allRecords: UnescoRecord[] = [];
    let offset = 0;
    const pageSize = 100;

    // Paginate through all records (max ~13 pages)
    for (let page = 0; page < 15; page++) {
      const res = await fetch(`${UNESCO_API}${offset}`, {
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) break;

      const data = await res.json();
      const records = data.results ?? [];
      if (records.length === 0) break;

      allRecords.push(...records);
      offset += pageSize;

      if (records.length < pageSize) break;
    }

    if (allRecords.length === 0) {
      if (cache) {
        return NextResponse.json(cache.data, {
          headers: {
            "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
            "X-Atlas-Stale": "1",
          },
        });
      }
      return NextResponse.json(
        { error: "UNESCO API unavailable" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const features: GeoJSON.Feature[] = allRecords
      .filter((r) => r.coordinates?.lat != null && r.coordinates?.lon != null)
      .map((r, i) => ({
        type: "Feature" as const,
        id: i,
        geometry: {
          type: "Point" as const,
          coordinates: [r.coordinates!.lon, r.coordinates!.lat],
        },
        properties: {
          name: r.name_en ?? "",
          category: r.category ?? "",
          region: r.region ?? "",
          country: r.states_names?.[0] ?? "",
          iso_code: r.iso_codes?.[0] ?? "",
          year_inscribed: r.date_inscribed ? parseInt(r.date_inscribed, 10) : null,
          danger: r.danger ?? false,
          area_hectares: r.area_hectares,
        },
      }));

    const fc = {
      type: "FeatureCollection",
      features,
    } as GeoJSON.FeatureCollection;

    cache = { data: fc, timestamp: Date.now() };

    return NextResponse.json(
      fc,
      { headers: { "Cache-Control": CACHE_CONTROL } },
    );
  } catch {
    if (cache) {
      return NextResponse.json(cache.data, {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
          "X-Atlas-Stale": "1",
        },
      });
    }
    return NextResponse.json(
      { error: "UNESCO API unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
