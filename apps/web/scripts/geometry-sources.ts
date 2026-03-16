/**
 * Static geometry source definitions.
 *
 * Each entry describes where to download boundary GeoJSON,
 * how to simplify it, and which properties to keep.
 *
 * The build-geometry script consumes these definitions
 * to produce static files in public/geo/.
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface GeometrySource {
  /** Stable ID matching the geometry registry entry. */
  id: string;
  /** Download URL — direct GeoJSON or geoBoundaries API endpoint. */
  url: string;
  /** Output path relative to public/ (e.g. "geo/se/admin1.geojson"). */
  outputPath: string;
  /** @turf/simplify tolerance. Higher = more simplification. */
  simplifyTolerance: number;
  /** Coordinate decimal places (5 ≈ 1.1m accuracy). */
  coordinatePrecision: number;
  /**
   * Map source property names to canonical output property names.
   * Only mapped properties are kept; all others are stripped.
   */
  propertyMap: Record<string, string>;
  /** Optional feature filter (return true to keep). */
  filter?: (f: GeoJSON.Feature) => boolean;
  /** If true, URL is a geoBoundaries API endpoint — follow gjDownloadURL. */
  isGeoBoundariesApi?: boolean;
  /** Use the simplified version from geoBoundaries instead of full. */
  useSimplified?: boolean;
  /** Post-processing tag (handled in build script). */
  postProcess?: "clip-sweden-land";
  /** Expected approximate feature count (for validation). */
  expectedFeatures?: number;
}

// ═══════════════════════════════════════════════════════════════
// Natural Earth base URLs
// ═══════════════════════════════════════════════════════════════

const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";

// ═══════════════════════════════════════════════════════════════
// Eurostat GISCO base URL
// ═══════════════════════════════════════════════════════════════

const GISCO = "https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson";

// ═══════════════════════════════════════════════════════════════
// geoBoundaries helper
// ═══════════════════════════════════════════════════════════════

function gb(iso3: string, level: "ADM1" | "ADM2" | "ADM3"): string {
  return `https://www.geoboundaries.org/api/current/gbOpen/${iso3}/${level}/`;
}

// ═══════════════════════════════════════════════════════════════
// geoBoundaries property maps
// ═══════════════════════════════════════════════════════════════

/** Standard property map for geoBoundaries ADM1 features. */
const GB_ADM1_PROPS: Record<string, string> = {
  shapeName: "name",
  shapeISO: "iso_3166_2",
  shapeGroup: "iso_a3",
};

/** Standard property map for geoBoundaries ADM2 features.
 *  Note: shapeISO is always empty at ADM2 level, so we only keep name + iso_a3. */
const GB_ADM2_PROPS: Record<string, string> = {
  shapeName: "name",
  shapeGroup: "iso_a3",
};

/** Standard property map for geoBoundaries ADM3 features. */
const GB_ADM3_PROPS: Record<string, string> = {
  shapeName: "name",
  shapeISO: "code",
  shapeGroup: "iso_a3",
};

// ═══════════════════════════════════════════════════════════════
// Source definitions
// ═══════════════════════════════════════════════════════════════

export const SOURCES: GeometrySource[] = [
  // ── Global layers ──────────────────────────────────────────

  {
    id: "natural-earth:ne_110m_admin_0_countries",
    url: `${NE}/ne_110m_admin_0_countries.geojson`,
    outputPath: "geo/global/admin0_110m.geojson",
    simplifyTolerance: 0.01,
    coordinatePrecision: 4,
    propertyMap: {
      NAME: "name",
      ISO_A2_EH: "iso_a2",
      ISO_A3_EH: "iso_a3",
    },
    expectedFeatures: 177,
  },

  {
    id: "natural-earth:ne_50m_admin_0_countries",
    url: `${NE}/ne_50m_admin_0_countries.geojson`,
    outputPath: "geo/global/admin0_50m.geojson",
    simplifyTolerance: 0.005,
    coordinatePrecision: 5,
    propertyMap: {
      NAME: "name",
      ISO_A2_EH: "iso_a2",
      ISO_A3_EH: "iso_a3",
    },
    expectedFeatures: 242,
  },

  {
    id: "natural-earth:ne_10m_admin_1_states_provinces",
    url: `${NE}/ne_10m_admin_1_states_provinces.geojson`,
    outputPath: "geo/global/admin1.geojson",
    simplifyTolerance: 0.01,
    coordinatePrecision: 5,
    propertyMap: {
      name: "name",
      name_en: "name_en",
      iso_3166_2: "iso_3166_2",
      iso_a2: "iso_a2",
    },
    expectedFeatures: 4500, // ~4596 but some may be filtered
  },

  {
    id: "natural-earth:ne_110m_populated_places",
    url: `${NE}/ne_110m_populated_places_simple.geojson`,
    outputPath: "geo/global/cities.geojson",
    simplifyTolerance: 0, // point geometry — no simplification
    coordinatePrecision: 4,
    propertyMap: {
      name: "name",
      iso_a2: "iso_a2",
      pop_max: "pop_max",
    },
    expectedFeatures: 240,
  },

  // ── EU NUTS layers ─────────────────────────────────────────

  {
    id: "eurostat:nuts0",
    url: `${GISCO}/NUTS_RG_20M_2024_4326_LEVL_0.geojson`,
    outputPath: "geo/eu/nuts0.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: { NUTS_ID: "nuts_id", CNTR_CODE: "iso_a2", NUTS_NAME: "name" },
    expectedFeatures: 31,
  },

  {
    id: "eurostat:nuts1",
    url: `${GISCO}/NUTS_RG_20M_2024_4326_LEVL_1.geojson`,
    outputPath: "geo/eu/nuts1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: { NUTS_ID: "nuts_id", NUTS_NAME: "name" },
    expectedFeatures: 104,
  },

  {
    id: "eurostat:nuts2",
    url: `${GISCO}/NUTS_RG_20M_2024_4326_LEVL_2.geojson`,
    outputPath: "geo/eu/nuts2.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: { NUTS_ID: "nuts_id", NUTS_NAME: "name" },
    expectedFeatures: 280,
  },

  {
    id: "eurostat:nuts3",
    url: `${GISCO}/NUTS_RG_20M_2024_4326_LEVL_3.geojson`,
    outputPath: "geo/eu/nuts3.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: { NUTS_ID: "nuts_id", NUTS_NAME: "name" },
    expectedFeatures: 1500,
  },

  // ── Sweden ─────────────────────────────────────────────────

  {
    id: "se:admin1",
    url: gb("SWE", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/se/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 21,
  },

  {
    id: "se:municipalities",
    url: gb("SWE", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/se/municipalities.geojson",
    simplifyTolerance: 0.0005,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    postProcess: "clip-sweden-land",
    expectedFeatures: 290,
  },

  // ── Norway ─────────────────────────────────────────────────

  {
    id: "no:admin1",
    url: gb("NOR", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/no/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 11,
  },

  {
    id: "no:municipalities",
    url: gb("NOR", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/no/municipalities.geojson",
    simplifyTolerance: 0.0005,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 350,
  },

  // ── Denmark ────────────────────────────────────────────────

  {
    id: "dk:admin1",
    url: gb("DNK", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/dk/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 5,
  },

  {
    id: "dk:municipalities",
    url: gb("DNK", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/dk/municipalities.geojson",
    simplifyTolerance: 0.0005,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 98,
  },

  // ── Finland ────────────────────────────────────────────────

  {
    id: "fi:admin1",
    url: gb("FIN", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/fi/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 19,
  },

  {
    id: "fi:municipalities",
    url: gb("FIN", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/fi/municipalities.geojson",
    simplifyTolerance: 0.0005,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 60,
  },

  // ── Germany ────────────────────────────────────────────────

  {
    id: "de:admin1",
    url: gb("DEU", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/de/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 16,
  },

  {
    id: "de:admin2",
    url: gb("DEU", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/de/admin2.geojson",
    simplifyTolerance: 0.0005,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 38,
  },

  // ── France ─────────────────────────────────────────────────

  {
    id: "fr:admin1",
    url: gb("FRA", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/fr/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 13,
  },

  {
    id: "fr:admin2",
    url: gb("FRA", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/fr/admin2.geojson",
    simplifyTolerance: 0.0005,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 96,
  },

  // ── United Kingdom ─────────────────────────────────────────

  {
    id: "gb:admin1",
    url: gb("GBR", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/gb/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 4,
  },

  {
    id: "gb:admin2",
    url: gb("GBR", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/gb/admin2.geojson",
    simplifyTolerance: 0.0005,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 200,
  },

  // ── Netherlands ────────────────────────────────────────────

  {
    id: "nl:admin1",
    url: gb("NLD", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/nl/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 12,
  },

  {
    id: "nl:municipalities",
    url: gb("NLD", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/nl/municipalities.geojson",
    simplifyTolerance: 0.0005,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 340,
  },

  // ── Spain ──────────────────────────────────────────────────

  {
    id: "es:admin1",
    url: gb("ESP", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/es/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 19,
  },

  {
    id: "es:admin2",
    url: gb("ESP", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/es/admin2.geojson",
    simplifyTolerance: 0.0005,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 50,
  },

  // ── Italy ──────────────────────────────────────────────────

  {
    id: "it:admin1",
    url: gb("ITA", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/it/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 20,
  },

  {
    id: "it:admin2",
    url: gb("ITA", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/it/admin2.geojson",
    simplifyTolerance: 0.0005,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 100,
  },

  // ── Poland ─────────────────────────────────────────────────

  {
    id: "pl:admin1",
    url: gb("POL", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/pl/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 16,
  },

  {
    id: "pl:admin2",
    url: gb("POL", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/pl/admin2.geojson",
    simplifyTolerance: 0.0005,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 370,
  },

  // ── United States ──────────────────────────────────────────

  {
    id: "us:states",
    url: gb("USA", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/us/states.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 52,
  },

  {
    id: "us:counties",
    url: gb("USA", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/us/counties.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 3200,
  },

  // ── Canada ─────────────────────────────────────────────────

  {
    id: "ca:admin1",
    url: gb("CAN", "ADM1"),
    isGeoBoundariesApi: true,
    useSimplified: true,
    outputPath: "geo/ca/admin1.geojson",
    simplifyTolerance: 0.005,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 13,
  },

  {
    id: "ca:admin2",
    url: gb("CAN", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/ca/admin2.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 290,
  },

  // ── Mexico ─────────────────────────────────────────────────

  {
    id: "mx:admin1",
    url: gb("MEX", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/mx/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 32,
  },

  {
    id: "mx:municipalities",
    url: gb("MEX", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/mx/municipalities.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 2400,
  },

  // ── Brazil ─────────────────────────────────────────────────

  {
    id: "br:admin1",
    url: gb("BRA", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/br/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 27,
  },

  {
    id: "br:municipalities",
    url: gb("BRA", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/br/municipalities.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 5500,
  },

  // ── Japan ──────────────────────────────────────────────────

  {
    id: "jp:prefectures",
    url: gb("JPN", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/jp/prefectures.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 47,
  },

  {
    id: "jp:municipalities",
    url: gb("JPN", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/jp/municipalities.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 1700,
  },

  // ── South Korea ────────────────────────────────────────────

  {
    id: "kr:admin1",
    url: gb("KOR", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/kr/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 17,
  },

  {
    id: "kr:admin2",
    url: gb("KOR", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/kr/admin2.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 220,
  },

  // ── China ──────────────────────────────────────────────────

  {
    id: "cn:admin1",
    url: gb("CHN", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/cn/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 34,
  },

  // ── India ──────────────────────────────────────────────────

  {
    id: "in:admin1",
    url: gb("IND", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/in/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 36,
  },

  {
    id: "in:districts",
    url: gb("IND", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/in/districts.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 700,
  },

  // ── Indonesia ──────────────────────────────────────────────

  {
    id: "id:admin1",
    url: gb("IDN", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/id/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 34,
  },

  // ── Australia ──────────────────────────────────────────────

  {
    id: "au:admin1",
    url: gb("AUS", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/au/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 9,
  },

  // ── South Africa ───────────────────────────────────────────

  {
    id: "za:admin1",
    url: gb("ZAF", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/za/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 9,
  },

  {
    id: "za:admin2",
    url: gb("ZAF", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/za/admin2.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 52,
  },

  // ── Nigeria ────────────────────────────────────────────────

  {
    id: "ng:admin1",
    url: gb("NGA", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/ng/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 37,
  },

  {
    id: "ng:admin2",
    url: gb("NGA", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/ng/admin2.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 770,
  },

  // ── Turkey ─────────────────────────────────────────────────

  {
    id: "tr:admin1",
    url: gb("TUR", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/tr/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 81,
  },

  {
    id: "tr:admin2",
    url: gb("TUR", "ADM2"),
    isGeoBoundariesApi: true,
    outputPath: "geo/tr/admin2.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM2_PROPS,
    expectedFeatures: 900,
  },

  // ── Russia ─────────────────────────────────────────────────

  {
    id: "ru:admin1",
    url: gb("RUS", "ADM1"),
    isGeoBoundariesApi: true,
    outputPath: "geo/ru/admin1.geojson",
    simplifyTolerance: 0.001,
    coordinatePrecision: 5,
    propertyMap: GB_ADM1_PROPS,
    expectedFeatures: 83,
  },
];
