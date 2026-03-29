/**
 * Reusable boundary registry.
 *
 * Stores and resolves available geometry layers by geography semantics,
 * not by ad hoc source-specific branching.
 *
 * Each entry describes a boundary layer: what geography it covers,
 * how to join data to it, and where to load it from.
 *
 * The registry is static and deterministic — no network calls.
 * Loaders are described as metadata (URL, file path) but NOT executed here.
 *
 * Provisional entries (status = "provisional") indicate layers that
 * are structurally defined but not yet integrated or verified.
 */

import type { GeographyLevel, CodeFamily } from "./normalized-result";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** How the geometry can be loaded at runtime. */
export type LoaderType =
  | "api_route"       // internal Next.js API route (e.g. /api/geo/world-countries)
  | "cdn_url"         // external CDN / GitHub raw URL
  | "local_file"      // file in public/ or data/ directory
  | "generated";      // dynamically generated (e.g. grid cells)

/** How production-ready a geometry layer is. */
export type LayerStatus =
  | "production"      // verified, cached, tested
  | "provisional"     // structurally defined but not yet integrated
  | "deprecated";     // kept for backward compatibility, prefer alternative

/** Resolution quality tier. */
export type ResolutionTier =
  | "low"             // 110m Natural Earth — global overviews
  | "medium"          // 50m or 10m Natural Earth — regional detail
  | "high"            // national statistical office boundaries — full detail
  | "variable";       // mixed or source-dependent

/** Scope: which countries/regions this layer covers. */
export interface LayerScope {
  /**
   * ISO 3166-1 alpha-2 country code, or special values:
   *   "GLOBAL" — worldwide coverage
   *   "EU"     — EU member states
   */
  regionCode: string;
  /** Optional human-readable scope description. */
  description?: string;
}

/** How to join data records to geometry features. */
export interface JoinKeyConfig {
  /** Property name in the GeoJSON features. */
  geometryProperty: string;
  /** Which code family this property uses. */
  codeFamily: CodeFamily;
}

/** A single geometry layer entry in the registry. */
export interface GeometryEntry {
  /** Unique stable identifier. Format: "<source>:<dataset>". */
  id: string;
  /** Human-readable name. */
  name: string;
  /** What geography level this layer represents. */
  level: GeographyLevel;
  /** Geographic scope. */
  scope: LayerScope;

  /** Where to load the geometry from. */
  loaderType: LoaderType;
  /** Loader target: URL, file path, or API route. */
  loaderTarget: string;

  /** Join keys available on this geometry. Multiple keys support different code systems. */
  joinKeys: JoinKeyConfig[];
  /** Property that uniquely identifies each feature (for stable references). */
  featureIdProperty: string;
  /** Property for human-readable feature names (optional). */
  nameProperty?: string;

  /** Approximate feature count (for capacity planning). */
  featureCount?: number;
  /** Resolution quality. */
  resolution: ResolutionTier;
  /** Production readiness. */
  status: LayerStatus;
  /** Freeform notes about limitations or provenance. */
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════
// Registry entries
// ═══════════════════════════════════════════════════════════════

/**
 * All registered geometry layers.
 *
 * Entries are ordered by scope (global → regional → national)
 * and within each scope by level (country → admin1 → admin2 → ...).
 *
 * Provisional entries are included so the pipeline can reason about
 * what geometry COULD be available, even before loaders are built.
 */
/** Standard join keys for geoBoundaries ADM1 files (ISO 3166-2 + name). */
const GB_ADM1_KEYS: JoinKeyConfig[] = [
  { geometryProperty: "iso_3166_2", codeFamily: { family: "iso", namespace: "3166-2" } },
  { geometryProperty: "name", codeFamily: { family: "name" } },
];

/** Standard join keys for geoBoundaries ADM2 files (name only — shapeISO is empty at ADM2). */
const GB_ADM2_KEYS: JoinKeyConfig[] = [
  { geometryProperty: "name", codeFamily: { family: "name" } },
];

// Import auto-generated entries (if they exist)
let GENERATED_ENTRIES: GeometryEntry[] = [];
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const generated = require("./geometry-registry-generated");
  GENERATED_ENTRIES = generated.GENERATED_ENTRIES ?? [];
} catch {
  // Generated file doesn't exist yet — skip
}

const MANUAL_ENTRIES: GeometryEntry[] = [
  // ── Global layers ──────────────────────────────────────────

  {
    id: "natural-earth:ne_110m_admin_0_countries",
    name: "Natural Earth 110m Countries",
    level: "country",
    scope: { regionCode: "GLOBAL" },
    loaderType: "local_file",
    loaderTarget: "geo/global/admin0_110m.geojson",
    joinKeys: [
      { geometryProperty: "iso_a3", codeFamily: { family: "iso", namespace: "alpha3" } },
      { geometryProperty: "iso_a2", codeFamily: { family: "iso", namespace: "alpha2" } },
      { geometryProperty: "name", codeFamily: { family: "name" } },
    ],
    featureIdProperty: "iso_a3",
    nameProperty: "name",
    featureCount: 177,
    resolution: "low",
    status: "production",
  },

  {
    id: "natural-earth:ne_50m_admin_0_countries",
    name: "Natural Earth 50m Countries",
    level: "country",
    scope: { regionCode: "GLOBAL" },
    loaderType: "local_file",
    loaderTarget: "geo/global/admin0_50m.geojson",
    joinKeys: [
      { geometryProperty: "iso_a3", codeFamily: { family: "iso", namespace: "alpha3" } },
      { geometryProperty: "iso_a2", codeFamily: { family: "iso", namespace: "alpha2" } },
      { geometryProperty: "name", codeFamily: { family: "name" } },
    ],
    featureIdProperty: "iso_a3",
    nameProperty: "name",
    featureCount: 242,
    resolution: "medium",
    status: "production",
  },

  {
    id: "natural-earth:ne_10m_admin_1_states_provinces",
    name: "Natural Earth 10m Admin 1 (States/Provinces)",
    level: "admin1",
    scope: { regionCode: "GLOBAL" },
    loaderType: "local_file",
    loaderTarget: "geo/global/admin1.geojson",
    joinKeys: [
      { geometryProperty: "iso_3166_2", codeFamily: { family: "iso", namespace: "3166-2" } },
      { geometryProperty: "name", codeFamily: { family: "name" } },
      { geometryProperty: "name_en", codeFamily: { family: "name" } },
    ],
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 4596,
    resolution: "medium",
    status: "production",
  },

  {
    id: "natural-earth:ne_110m_populated_places",
    name: "Natural Earth 110m Populated Places",
    level: "point_set",
    scope: { regionCode: "GLOBAL" },
    loaderType: "local_file",
    loaderTarget: "geo/global/cities.geojson",
    joinKeys: [
      { geometryProperty: "name", codeFamily: { family: "name" } },
    ],
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 243,
    resolution: "low",
    status: "production",
  },

  // ── EU NUTS layers ─────────────────────────────────────────

  {
    id: "eurostat:nuts0",
    name: "Eurostat NUTS Level 0",
    level: "nuts0",
    scope: { regionCode: "EU" },
    loaderType: "local_file",
    loaderTarget: "geo/eu/nuts0.geojson",
    joinKeys: [
      { geometryProperty: "nuts_id", codeFamily: { family: "eurostat", namespace: "nuts" } },
      { geometryProperty: "iso_a2", codeFamily: { family: "iso", namespace: "alpha2" } },
    ],
    featureIdProperty: "nuts_id",
    nameProperty: "name",
    featureCount: 39,
    resolution: "medium",
    status: "production",
  },

  {
    id: "eurostat:nuts1",
    name: "Eurostat NUTS Level 1",
    level: "nuts1",
    scope: { regionCode: "EU" },
    loaderType: "local_file",
    loaderTarget: "geo/eu/nuts1.geojson",
    joinKeys: [
      { geometryProperty: "nuts_id", codeFamily: { family: "eurostat", namespace: "nuts" } },
    ],
    featureIdProperty: "nuts_id",
    nameProperty: "name",
    featureCount: 115,
    resolution: "medium",
    status: "production",
  },

  {
    id: "eurostat:nuts2",
    name: "Eurostat NUTS Level 2",
    level: "nuts2",
    scope: { regionCode: "EU" },
    loaderType: "local_file",
    loaderTarget: "geo/eu/nuts2.geojson",
    joinKeys: [
      { geometryProperty: "nuts_id", codeFamily: { family: "eurostat", namespace: "nuts" } },
    ],
    featureIdProperty: "nuts_id",
    nameProperty: "name",
    featureCount: 299,
    resolution: "medium",
    status: "production",
  },

  {
    id: "eurostat:nuts3",
    name: "Eurostat NUTS Level 3",
    level: "nuts3",
    scope: { regionCode: "EU" },
    loaderType: "local_file",
    loaderTarget: "geo/eu/nuts3.geojson",
    joinKeys: [
      { geometryProperty: "nuts_id", codeFamily: { family: "eurostat", namespace: "nuts" } },
    ],
    featureIdProperty: "nuts_id",
    nameProperty: "name",
    featureCount: 1345,
    resolution: "medium",
    status: "production",
  },

  // ── Sweden ─────────────────────────────────────────────────

  {
    id: "se:admin1",
    name: "Sweden Counties (Län)",
    level: "admin1",
    scope: { regionCode: "SE" },
    loaderType: "local_file",
    loaderTarget: "geo/se/admin1.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 21,
    resolution: "high",
    status: "production",
  },

  {
    id: "se:municipalities",
    name: "Sweden Municipalities (Kommuner)",
    level: "municipality",
    scope: { regionCode: "SE" },
    loaderType: "local_file",
    loaderTarget: "geo/se/municipalities.geojson",
    joinKeys: [
      { geometryProperty: "scb_code", codeFamily: { family: "national", namespace: "se-scb" } },
      { geometryProperty: "name", codeFamily: { family: "name" } },
    ],
    featureIdProperty: "scb_code",
    nameProperty: "name",
    featureCount: 290,
    resolution: "high",
    status: "production",
    notes:
      "Land-clipped against NE 10m Sweden polygon. SCB 4-digit municipality codes added from TAB638. " +
      "Codes verified 2026-03-29 against SCB TAB638 Region dimension (290 municipalities). " +
      "To update: fetch TAB638 metadata, cross-reference 4-digit codes with geometry names. " +
      "Sweden last changed municipality structure in 2003 (Knivsta split from Uppsala).",
  },

  // ── Norway ─────────────────────────────────────────────────

  {
    id: "no:admin1",
    name: "Norway Counties (Fylker)",
    level: "admin1",
    scope: { regionCode: "NO" },
    loaderType: "local_file",
    loaderTarget: "geo/no/admin1.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 11,
    resolution: "high",
    status: "production",
  },

  {
    id: "no:municipalities",
    name: "Norway Municipalities (Kommuner)",
    level: "municipality",
    scope: { regionCode: "NO" },
    loaderType: "local_file",
    loaderTarget: "geo/no/municipalities.geojson",
    joinKeys: [
      { geometryProperty: "kommunenummer", codeFamily: { family: "national", namespace: "no-ssb" } },
      { geometryProperty: "name", codeFamily: { family: "name" } },
    ],
    featureIdProperty: "kommunenummer",
    nameProperty: "kommunenavn",
    featureCount: 357,
    resolution: "high",
    status: "production",
    notes: "Source: robhop/fylker-og-kommuner. 357 features, 2024 municipality structure. kommunenummer is 4-digit string (e.g. '0301' for Oslo).",
  },

  // ── Denmark ────────────────────────────────────────────────

  {
    id: "dk:admin1",
    name: "Denmark Regions (Regioner)",
    level: "admin1",
    scope: { regionCode: "DK" },
    loaderType: "local_file",
    loaderTarget: "geo/dk/admin1.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 5,
    resolution: "high",
    status: "production",
  },

  {
    id: "dk:municipalities",
    name: "Denmark Municipalities (Kommuner)",
    level: "municipality",
    scope: { regionCode: "DK" },
    loaderType: "local_file",
    loaderTarget: "geo/dk/municipalities.geojson",
    joinKeys: GB_ADM2_KEYS,
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 98,
    resolution: "high",
    status: "production",
  },

  // ── Finland ────────────────────────────────────────────────

  {
    id: "fi:admin1",
    name: "Finland Regions (Maakunnat)",
    level: "admin1",
    scope: { regionCode: "FI" },
    loaderType: "local_file",
    loaderTarget: "geo/fi/admin1.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 19,
    resolution: "high",
    status: "production",
  },

  {
    id: "fi:municipalities",
    name: "Finland Municipalities (Kunnat)",
    level: "municipality",
    scope: { regionCode: "FI" },
    loaderType: "local_file",
    loaderTarget: "geo/fi/municipalities.geojson",
    joinKeys: GB_ADM2_KEYS,
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 70,
    resolution: "high",
    status: "production",
  },

  // ── Germany ────────────────────────────────────────────────

  {
    id: "de:admin1",
    name: "Germany States (Bundesländer)",
    level: "admin1",
    scope: { regionCode: "DE" },
    loaderType: "local_file",
    loaderTarget: "geo/de/admin1.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 16,
    resolution: "high",
    status: "production",
  },

  {
    id: "de:admin2",
    name: "Germany Government Districts",
    level: "admin2",
    scope: { regionCode: "DE" },
    loaderType: "local_file",
    loaderTarget: "geo/de/admin2.geojson",
    joinKeys: GB_ADM2_KEYS,
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 38,
    resolution: "high",
    status: "production",
  },

  // ── France ─────────────────────────────────────────────────

  {
    id: "fr:admin1",
    name: "France Regions (Régions)",
    level: "admin1",
    scope: { regionCode: "FR" },
    loaderType: "local_file",
    loaderTarget: "geo/fr/admin1.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 13,
    resolution: "high",
    status: "production",
  },

  {
    id: "fr:admin2",
    name: "France Departments (Départements)",
    level: "admin2",
    scope: { regionCode: "FR" },
    loaderType: "local_file",
    loaderTarget: "geo/fr/admin2.geojson",
    joinKeys: GB_ADM2_KEYS,
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 96,
    resolution: "high",
    status: "production",
  },

  // ── United Kingdom ─────────────────────────────────────────

  {
    id: "gb:admin1",
    name: "UK Countries",
    level: "admin1",
    scope: { regionCode: "GB" },
    loaderType: "local_file",
    loaderTarget: "geo/gb/admin1.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 4,
    resolution: "high",
    status: "production",
  },

  {
    id: "gb:admin2",
    name: "UK Counties and Unitary Authorities",
    level: "admin2",
    scope: { regionCode: "GB" },
    loaderType: "local_file",
    loaderTarget: "geo/gb/admin2.geojson",
    joinKeys: GB_ADM2_KEYS,
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 216,
    resolution: "high",
    status: "production",
  },

  // ── Netherlands ────────────────────────────────────────────

  {
    id: "nl:admin1",
    name: "Netherlands Provinces (Provincies)",
    level: "admin1",
    scope: { regionCode: "NL" },
    loaderType: "local_file",
    loaderTarget: "geo/nl/admin1.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 12,
    resolution: "high",
    status: "production",
  },

  {
    id: "nl:municipalities",
    name: "Netherlands Municipalities (Gemeenten)",
    level: "municipality",
    scope: { regionCode: "NL" },
    loaderType: "local_file",
    loaderTarget: "geo/nl/municipalities.geojson",
    joinKeys: GB_ADM2_KEYS,
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 344,
    resolution: "high",
    status: "production",
  },

  // ── Spain ──────────────────────────────────────────────────

  {
    id: "es:admin1",
    name: "Spain Autonomous Communities",
    level: "admin1",
    scope: { regionCode: "ES" },
    loaderType: "local_file",
    loaderTarget: "geo/es/admin1.geojson",
    joinKeys: [
      { geometryProperty: "name", codeFamily: { family: "name" } },
    ],
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 19,
    resolution: "high",
    status: "production",
    notes: "geoBoundaries shapeISO contains country code (ESP) instead of province codes.",
  },

  {
    id: "es:admin2",
    name: "Spain Provinces (Provincias)",
    level: "admin2",
    scope: { regionCode: "ES" },
    loaderType: "local_file",
    loaderTarget: "geo/es/admin2.geojson",
    joinKeys: GB_ADM2_KEYS,
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 52,
    resolution: "high",
    status: "production",
  },

  // ── Italy ──────────────────────────────────────────────────

  {
    id: "it:admin1",
    name: "Italy Macro Regions",
    level: "admin1",
    scope: { regionCode: "IT" },
    loaderType: "local_file",
    loaderTarget: "geo/it/admin1.geojson",
    joinKeys: [
      { geometryProperty: "name", codeFamily: { family: "name" } },
    ],
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 5,
    resolution: "high",
    status: "production",
    notes: "geoBoundaries ADM1 has 5 macro regions, not 20 Italian regioni. No ISO codes available.",
  },

  {
    id: "it:admin2",
    name: "Italy Regions (Regioni)",
    level: "admin2",
    scope: { regionCode: "IT" },
    loaderType: "local_file",
    loaderTarget: "geo/it/admin2.geojson",
    joinKeys: GB_ADM2_KEYS,
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 20,
    resolution: "high",
    status: "production",
  },

  // ── Poland ─────────────────────────────────────────────────

  {
    id: "pl:admin1",
    name: "Poland Voivodeships (Województwa)",
    level: "admin1",
    scope: { regionCode: "PL" },
    loaderType: "local_file",
    loaderTarget: "geo/pl/admin1.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 16,
    resolution: "high",
    status: "production",
  },

  {
    id: "pl:admin2",
    name: "Poland Counties (Powiaty)",
    level: "admin2",
    scope: { regionCode: "PL" },
    loaderType: "local_file",
    loaderTarget: "geo/pl/admin2.geojson",
    joinKeys: GB_ADM2_KEYS,
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 380,
    resolution: "high",
    status: "production",
  },

  // ── United States ──────────────────────────────────────────

  {
    id: "us:states",
    name: "US States",
    level: "admin1",
    scope: { regionCode: "US" },
    loaderType: "local_file",
    loaderTarget: "geo/us/states.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 56,
    resolution: "high",
    status: "production",
  },

  {
    id: "us:counties",
    name: "US Counties",
    level: "admin2",
    scope: { regionCode: "US" },
    loaderType: "local_file",
    loaderTarget: "geo/us/counties.geojson",
    joinKeys: GB_ADM2_KEYS,
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 3233,
    resolution: "high",
    status: "production",
  },

  // ── Canada ─────────────────────────────────────────────────

  {
    id: "ca:admin1",
    name: "Canada Provinces and Territories",
    level: "admin1",
    scope: { regionCode: "CA" },
    loaderType: "local_file",
    loaderTarget: "geo/ca/admin1.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 13,
    resolution: "high",
    status: "production",
  },

  {
    id: "ca:admin2",
    name: "Canada Census Divisions",
    level: "admin2",
    scope: { regionCode: "CA" },
    loaderType: "local_file",
    loaderTarget: "geo/ca/admin2.geojson",
    joinKeys: GB_ADM2_KEYS,
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 76,
    resolution: "high",
    status: "production",
  },

  // ── Mexico ─────────────────────────────────────────────────

  {
    id: "mx:admin1",
    name: "Mexico States (Estados)",
    level: "admin1",
    scope: { regionCode: "MX" },
    loaderType: "local_file",
    loaderTarget: "geo/mx/admin1.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 32,
    resolution: "high",
    status: "production",
  },

  {
    id: "mx:municipalities",
    name: "Mexico Municipalities (Municipios)",
    level: "municipality",
    scope: { regionCode: "MX" },
    loaderType: "local_file",
    loaderTarget: "geo/mx/municipalities.geojson",
    joinKeys: GB_ADM2_KEYS,
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 2457,
    resolution: "high",
    status: "production",
  },

  // ── Brazil ─────────────────────────────────────────────────

  {
    id: "br:admin1",
    name: "Brazil States (Estados)",
    level: "admin1",
    scope: { regionCode: "BR" },
    loaderType: "local_file",
    loaderTarget: "geo/br/admin1.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 27,
    resolution: "high",
    status: "production",
  },

  {
    id: "br:municipalities",
    name: "Brazil Municipalities (Municípios)",
    level: "municipality",
    scope: { regionCode: "BR" },
    loaderType: "local_file",
    loaderTarget: "geo/br/municipalities.geojson",
    joinKeys: GB_ADM2_KEYS,
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 5570,
    resolution: "high",
    status: "production",
  },

  // ── Japan ──────────────────────────────────────────────────

  {
    id: "jp:prefectures",
    name: "Japan Prefectures",
    level: "admin1",
    scope: { regionCode: "JP" },
    loaderType: "local_file",
    loaderTarget: "geo/jp/prefectures.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 47,
    resolution: "high",
    status: "production",
  },

  {
    id: "jp:municipalities",
    name: "Japan Municipalities",
    level: "municipality",
    scope: { regionCode: "JP" },
    loaderType: "local_file",
    loaderTarget: "geo/jp/municipalities.geojson",
    joinKeys: GB_ADM2_KEYS,
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 1742,
    resolution: "high",
    status: "production",
  },

  // ── South Korea ────────────────────────────────────────────

  {
    id: "kr:admin1",
    name: "South Korea Provinces",
    level: "admin1",
    scope: { regionCode: "KR" },
    loaderType: "local_file",
    loaderTarget: "geo/kr/admin1.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 17,
    resolution: "high",
    status: "production",
  },

  {
    id: "kr:admin2",
    name: "South Korea Districts",
    level: "admin2",
    scope: { regionCode: "KR" },
    loaderType: "local_file",
    loaderTarget: "geo/kr/admin2.geojson",
    joinKeys: GB_ADM2_KEYS,
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 228,
    resolution: "high",
    status: "production",
  },

  // ── China ──────────────────────────────────────────────────

  {
    id: "cn:admin1",
    name: "China Provinces",
    level: "admin1",
    scope: { regionCode: "CN" },
    loaderType: "local_file",
    loaderTarget: "geo/cn/admin1.geojson",
    joinKeys: [
      { geometryProperty: "name", codeFamily: { family: "name" } },
    ],
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 34,
    resolution: "high",
    status: "production",
    notes: "geoBoundaries shapeISO contains country code (CHN) instead of province codes.",
  },

  // ── India ──────────────────────────────────────────────────

  {
    id: "in:admin1",
    name: "India States and Union Territories",
    level: "admin1",
    scope: { regionCode: "IN" },
    loaderType: "local_file",
    loaderTarget: "geo/in/admin1.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 36,
    resolution: "high",
    status: "production",
  },

  {
    id: "in:districts",
    name: "India Districts",
    level: "admin2",
    scope: { regionCode: "IN" },
    loaderType: "local_file",
    loaderTarget: "geo/in/districts.geojson",
    joinKeys: GB_ADM2_KEYS,
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 735,
    resolution: "high",
    status: "production",
  },

  // ── Indonesia ──────────────────────────────────────────────

  {
    id: "id:admin1",
    name: "Indonesia Provinces (Provinsi)",
    level: "admin1",
    scope: { regionCode: "ID" },
    loaderType: "local_file",
    loaderTarget: "geo/id/admin1.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 34,
    resolution: "high",
    status: "production",
  },

  // ── Australia ──────────────────────────────────────────────

  {
    id: "au:admin1",
    name: "Australia States and Territories",
    level: "admin1",
    scope: { regionCode: "AU" },
    loaderType: "local_file",
    loaderTarget: "geo/au/admin1.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 9,
    resolution: "high",
    status: "production",
  },

  // ── South Africa ───────────────────────────────────────────

  {
    id: "za:admin1",
    name: "South Africa Provinces",
    level: "admin1",
    scope: { regionCode: "ZA" },
    loaderType: "local_file",
    loaderTarget: "geo/za/admin1.geojson",
    joinKeys: [
      { geometryProperty: "iso_3166_2", codeFamily: { family: "iso", namespace: "3166-2" } },
      { geometryProperty: "name", codeFamily: { family: "name" } },
    ],
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 9,
    resolution: "high",
    status: "production",
    notes: "shapeISO has abbreviated codes (EC, FS) not full ISO (ZA-EC, ZA-FS).",
  },

  {
    id: "za:admin2",
    name: "South Africa District Municipalities",
    level: "admin2",
    scope: { regionCode: "ZA" },
    loaderType: "local_file",
    loaderTarget: "geo/za/admin2.geojson",
    joinKeys: GB_ADM2_KEYS,
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 52,
    resolution: "high",
    status: "production",
  },

  // ── Nigeria ────────────────────────────────────────────────

  {
    id: "ng:admin1",
    name: "Nigeria States",
    level: "admin1",
    scope: { regionCode: "NG" },
    loaderType: "local_file",
    loaderTarget: "geo/ng/admin1.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 37,
    resolution: "high",
    status: "production",
  },

  {
    id: "ng:admin2",
    name: "Nigeria Local Government Areas",
    level: "admin2",
    scope: { regionCode: "NG" },
    loaderType: "local_file",
    loaderTarget: "geo/ng/admin2.geojson",
    joinKeys: GB_ADM2_KEYS,
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 774,
    resolution: "high",
    status: "production",
  },

  // ── Turkey ─────────────────────────────────────────────────

  {
    id: "tr:admin1",
    name: "Turkey Provinces (İller)",
    level: "admin1",
    scope: { regionCode: "TR" },
    loaderType: "local_file",
    loaderTarget: "geo/tr/admin1.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 81,
    resolution: "high",
    status: "production",
  },

  {
    id: "tr:admin2",
    name: "Turkey Districts (İlçeler)",
    level: "admin2",
    scope: { regionCode: "TR" },
    loaderType: "local_file",
    loaderTarget: "geo/tr/admin2.geojson",
    joinKeys: GB_ADM2_KEYS,
    featureIdProperty: "name",
    nameProperty: "name",
    featureCount: 973,
    resolution: "high",
    status: "production",
  },

  // ── Russia ─────────────────────────────────────────────────

  {
    id: "ru:admin1",
    name: "Russia Federal Subjects",
    level: "admin1",
    scope: { regionCode: "RU" },
    loaderType: "local_file",
    loaderTarget: "geo/ru/admin1.geojson",
    joinKeys: GB_ADM1_KEYS,
    featureIdProperty: "iso_3166_2",
    nameProperty: "name",
    featureCount: 83,
    resolution: "high",
    status: "production",
  },
];

// Merge manual (production) + generated (provisional) entries.
// Manual entries take precedence in resolveBestEntry() via status ranking.
const ENTRIES: GeometryEntry[] = [...MANUAL_ENTRIES, ...GENERATED_ENTRIES];

// ═══════════════════════════════════════════════════════════════
// Lookup helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Get all registered geometry entries.
 * Returns a frozen copy — the registry is immutable at runtime.
 */
export function getAllEntries(): readonly GeometryEntry[] {
  return ENTRIES;
}

/**
 * Find geometry entries by geography level.
 * Returns all scopes (global + country-specific) for that level.
 */
export function findByLevel(level: GeographyLevel): GeometryEntry[] {
  return ENTRIES.filter((e) => e.level === level);
}

/**
 * Find geometry entries for a specific country and level.
 *
 * Lookup precedence:
 *   1. Country-specific layer (exact regionCode match)
 *   2. Regional layer (e.g. "EU" for NUTS)
 *   3. Global fallback (regionCode = "GLOBAL")
 *
 * Returns all matches sorted by specificity (most specific first).
 */
export function findByCountryAndLevel(
  countryCode: string,
  level: GeographyLevel,
): GeometryEntry[] {
  const upper = countryCode.toUpperCase();

  // Filter: level must match AND scope must be relevant to the country
  const matches = ENTRIES.filter(
    (e) => e.level === level && scopeSpecificity(e.scope.regionCode, upper) > 0,
  );

  // Sort: country-specific first, then regional, then global
  return matches.sort((a, b) => {
    const scoreA = scopeSpecificity(a.scope.regionCode, upper);
    const scoreB = scopeSpecificity(b.scope.regionCode, upper);
    return scoreB - scoreA;
  });
}

/** Score how specific a scope is relative to a target country. */
function scopeSpecificity(scopeCode: string, targetCountry: string): number {
  if (scopeCode === targetCountry) return 3; // exact country match
  if (scopeCode === regionForCountry(targetCountry)) return 2; // regional match
  if (scopeCode === "GLOBAL") return 1; // global fallback
  return 0; // no match
}

/**
 * Find geometry entries by region family (scope code).
 * e.g. "EU" returns all NUTS layers, "GLOBAL" returns Natural Earth, etc.
 */
export function findByRegion(regionCode: string): GeometryEntry[] {
  const upper = regionCode.toUpperCase();
  return ENTRIES.filter((e) => e.scope.regionCode === upper);
}

/**
 * Find geometry entries whose join keys are compatible with a given code family.
 *
 * A join key is compatible when:
 *   - family matches exactly
 *   - namespace matches (or join key has no namespace constraint)
 */
export function findByJoinCompatibility(codeFamily: CodeFamily): GeometryEntry[] {
  return ENTRIES.filter((e) =>
    e.joinKeys.some((jk) => isJoinKeyCompatible(jk.codeFamily, codeFamily)),
  );
}

/**
 * Look up a single entry by its stable ID.
 * Returns undefined if not found.
 */
export function findById(id: string): GeometryEntry | undefined {
  return ENTRIES.find((e) => e.id === id);
}

/**
 * Best-effort resolution: given a country code and level,
 * find the single best geometry entry.
 *
 * Prefers: production > provisional, country-specific > regional > global.
 * Returns undefined when no entry exists for the combination.
 */
export function resolveBestEntry(
  countryCode: string,
  level: GeographyLevel,
): GeometryEntry | undefined {
  // Exclude deprecated entries — they are too incomplete for use
  const candidates = findByCountryAndLevel(countryCode, level)
    .filter((e) => e.status !== "deprecated");
  if (candidates.length === 0) return undefined;

  // Among matching entries, prefer production status
  const production = candidates.filter((e) => e.status === "production");
  if (production.length > 0) return production[0];

  // Fall back to provisional (still sorted by specificity)
  const provisional = candidates.filter((e) => e.status === "provisional");
  if (provisional.length > 0) return provisional[0];

  return candidates[0];
}

// ═══════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════

/** Check if two code families are compatible for joining. */
function isJoinKeyCompatible(
  entryFamily: CodeFamily,
  queryFamily: CodeFamily,
): boolean {
  if (entryFamily.family !== queryFamily.family) return false;
  // If the entry has a namespace, the query must match it.
  // If the entry has no namespace, any query namespace is accepted.
  if (entryFamily.namespace && queryFamily.namespace) {
    return entryFamily.namespace === queryFamily.namespace;
  }
  return true;
}

/**
 * Map country codes to their regional grouping.
 * Used for fallback lookups (e.g. SE → EU for NUTS layers).
 */
const COUNTRY_TO_REGION: Record<string, string> = {
  // EU member states
  AT: "EU", BE: "EU", BG: "EU", HR: "EU", CY: "EU",
  CZ: "EU", DK: "EU", EE: "EU", FI: "EU", FR: "EU",
  DE: "EU", GR: "EU", HU: "EU", IE: "EU", IT: "EU",
  LV: "EU", LT: "EU", LU: "EU", MT: "EU", NL: "EU",
  PL: "EU", PT: "EU", RO: "EU", SK: "EU", SI: "EU",
  ES: "EU", SE: "EU",
  // EFTA (covered by Eurostat NUTS)
  NO: "EU", CH: "EU", IS: "EU", LI: "EU",
};

function regionForCountry(countryCode: string): string | undefined {
  return COUNTRY_TO_REGION[countryCode];
}
