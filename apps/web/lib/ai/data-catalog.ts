import type { ProfileGeometryType } from "./types";

// ─── Types ───────────────────────────────────────────────────

export interface CatalogEntry {
  id: string;
  endpoint: string;
  label: string;
  description: string;
  geometryType: ProfileGeometryType;
  /** Keywords for fuzzy matching against user prompts. */
  topics: string[];
  /** Attribute names available in the dataset. */
  attributes: string[];
  /** Geographic bounds [[south, west], [north, east]]. */
  bounds?: [[number, number], [number, number]];
  /** Environment variable required for this endpoint. */
  requiresEnv?: string;
}

// ─── Catalog ─────────────────────────────────────────────────

export const DATA_CATALOG: CatalogEntry[] = [
  {
    id: "earthquakes",
    endpoint: "/api/earthquakes",
    label: "USGS Earthquakes (24h, M2.5+)",
    description:
      "Global earthquake events from USGS — past 24 hours, magnitude 2.5+. Updated every 5 minutes.",
    geometryType: "Point",
    topics: [
      "earthquake",
      "seismic",
      "quake",
      "tremor",
      "jordbävning",
      "usgs",
      "tectonic",
    ],
    attributes: ["mag", "place", "time", "depth", "title", "tsunami", "felt"],
    bounds: [
      [-90, -180],
      [90, 180],
    ],
  },
  {
    id: "world-countries",
    endpoint: "/api/geo/world-countries",
    label: "World Countries",
    description:
      "Country boundaries from Natural Earth (110m simplified). Includes population and GDP estimates.",
    geometryType: "Polygon",
    topics: [
      "country",
      "countries",
      "nation",
      "nations",
      "world",
      "global",
      "border",
      "continent",
      "länder",
      "land",
      "population",
      "befolkning",
      "gdp",
      "bnp",
    ],
    attributes: [
      "name",
      "iso_a3",
      "continent",
      "subregion",
      "pop_est",
      "gdp_md",
    ],
    bounds: [
      [-90, -180],
      [90, 180],
    ],
  },
  {
    id: "world-cities",
    endpoint: "/api/geo/world-cities",
    label: "Major World Cities",
    description:
      "Populated places from Natural Earth — ~240 major cities with population estimates.",
    geometryType: "Point",
    topics: [
      "city",
      "cities",
      "town",
      "towns",
      "urban",
      "capital",
      "stad",
      "städer",
      "huvudstad",
      "metropol",
    ],
    attributes: [
      "name",
      "country",
      "pop_max",
      "pop_min",
      "latitude",
      "longitude",
      "capital",
    ],
    bounds: [
      [-90, -180],
      [90, 180],
    ],
  },
  {
    id: "isochrone",
    endpoint: "/api/isochrone",
    label: "Travel Isochrones",
    description:
      "Reachability zones from any point — driving, walking, or cycling. Powered by OpenRouteService.",
    geometryType: "Polygon",
    topics: [
      "isochrone",
      "travel",
      "accessibility",
      "commute",
      "reach",
      "restid",
      "pendling",
      "tillgänglighet",
    ],
    attributes: ["value"],
    requiresEnv: "ORS_API_KEY",
  },
];

// ─── Matching ────────────────────────────────────────────────

/**
 * Find catalog entries whose topics match keywords in the prompt.
 * Returns entries sorted by number of topic hits (best match first).
 */
export function matchCatalog(prompt: string): CatalogEntry[] {
  const lower = prompt.toLowerCase();
  const words = lower.split(/\s+/);

  const scored = DATA_CATALOG.map((entry) => {
    let hits = 0;
    for (const topic of entry.topics) {
      // Check both substring match and word match
      if (lower.includes(topic)) hits++;
      if (words.includes(topic)) hits++;
    }
    return { entry, hits };
  });

  return scored
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((s) => s.entry);
}

/**
 * Build a context block describing available datasets for injection
 * into AI system prompts.
 */
export function catalogContext(): string {
  return DATA_CATALOG.map(
    (e) =>
      `- ${e.id}: ${e.description} (${e.geometryType}, endpoint: ${e.endpoint}, attributes: ${e.attributes.join(", ")})`,
  ).join("\n");
}
