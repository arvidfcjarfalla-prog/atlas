import { NextResponse } from "next/server";

const UNESCO_API =
  "https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/records?limit=100&offset=";

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
 * Caches for 24 hours (dataset changes rarely).
 */
export async function GET() {
  try {
    const allRecords: UnescoRecord[] = [];
    let offset = 0;
    const pageSize = 100;

    // Paginate through all records (max ~13 pages)
    for (let page = 0; page < 15; page++) {
      const res = await fetch(`${UNESCO_API}${offset}`, {
        next: { revalidate: 86400 },
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

    return NextResponse.json(
      { type: "FeatureCollection", features } as GeoJSON.FeatureCollection,
      { headers: { "Cache-Control": "public, s-maxage=86400" } },
    );
  } catch {
    return NextResponse.json(
      { error: "UNESCO API unavailable" },
      { status: 502 },
    );
  }
}
