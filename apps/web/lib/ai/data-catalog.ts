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
      "earthquakes",
      "seismic",
      "quake",
      "tremor",
      "jordbävning",
      "jordbävningar",
      "usgs",
      "tectonic",
      "seismisk",
      "earthquake activity",
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
      "largest cities",
      "biggest cities",
      "major cities",
      "world cities",
      "town",
      "towns",
      "urban",
      "capital",
      "population cities",
      "stad",
      "städer",
      "största städer",
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
  {
    id: "historical-basemaps",
    endpoint:
      "https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/",
    label: "Historical World Basemaps",
    description:
      "Historical political boundaries at various dates (1945, 1938, 1914, 1880, 1815, etc.). Each file is a world map snapshot.",
    geometryType: "Polygon",
    topics: [
      "historical",
      "history",
      "empire",
      "ww2",
      "ww1",
      "world war",
      "colonial",
      "cold war",
      "1945",
      "1938",
      "1914",
      "1880",
      "1815",
      "mongol",
      "mongoliska",
      "roman",
      "romerska",
      "romarriket",
      "ottoman",
      "osmanska",
      "british empire",
      "brittiska",
      "soviet",
      "sovjet",
      "ancient",
      "medieval",
      "historisk",
      "historia",
      "imperium",
      "imperiet",
      "rike",
      "världskrig",
      "andra världskriget",
      "första världskriget",
      "koloni",
      "kalla kriget",
      "antik",
      "medeltid",
      "napoleon",
      "napoleonkrigen",
      "viking",
      "vikinga",
      "aztec",
      "aztek",
      "persian",
      "persiska",
      "byzantine",
      "bysantinska",
      "crusade",
      "korståg",
    ],
    attributes: ["NAME", "SUBJECTO"],
    bounds: [
      [-90, -180],
      [90, 180],
    ],
  },
  {
    id: "live-flights",
    endpoint: "/api/flights",
    label: "Live Aircraft Positions",
    description:
      "Real-time global flight positions from OpenSky Network. Shows airborne aircraft with callsign, altitude, speed, and heading. Updated every 30 seconds.",
    geometryType: "Point",
    topics: [
      "flight",
      "flights",
      "aircraft",
      "airplane",
      "plane",
      "planes",
      "aviation",
      "air traffic",
      "flyg",
      "flygplan",
      "flygtrafik",
      "luftfart",
      "live flights",
      "flight tracking",
      "flight tracker",
    ],
    attributes: [
      "icao24",
      "callsign",
      "origin_country",
      "altitude",
      "velocity",
      "heading",
    ],
    bounds: [
      [-90, -180],
      [90, 180],
    ],
  },
  {
    id: "nasa-wildfires",
    endpoint: "/api/wildfires",
    label: "Active Wildfires (FIRMS/NASA)",
    description:
      "Active wildfire hotspots detected by NASA VIIRS satellite. Updated every 3 hours. Global coverage.",
    geometryType: "Point",
    topics: [
      "wildfire",
      "wildfires",
      "fire",
      "fires",
      "forest fire",
      "bushfire",
      "brand",
      "bränder",
      "skogsbrand",
      "skogsbränder",
      "eldsvåda",
      "active fires",
      "hotspot",
      "nasa firms",
    ],
    attributes: ["brightness", "confidence", "frp", "date", "time"],
    bounds: [
      [-90, -180],
      [90, 180],
    ],
    requiresEnv: "NASA_FIRMS_MAP_KEY",
  },
  {
    id: "citybikes",
    endpoint: "/api/citybikes",
    label: "Bike-Sharing Networks (Global)",
    description:
      "700+ bike-sharing networks worldwide from CityBikes API. Shows network locations with city and operator.",
    geometryType: "Point",
    topics: [
      "bike sharing",
      "bike share",
      "bikeshare",
      "citybike",
      "city bike",
      "bicycle sharing",
      "cykeldelnig",
      "stadscykel",
      "hyrcykel",
      "vélib",
      "boris bike",
    ],
    attributes: ["name", "city", "country", "company", "network_id"],
    bounds: [
      [-90, -180],
      [90, 180],
    ],
  },
  {
    id: "unesco-heritage",
    endpoint: "/api/heritage",
    label: "UNESCO World Heritage Sites",
    description:
      "1,248 World Heritage Sites — cultural and natural landmarks. Includes inscription year, danger status, and category.",
    geometryType: "Point",
    topics: [
      "world heritage",
      "heritage site",
      "heritage sites",
      "unesco",
      "cultural heritage",
      "natural heritage",
      "världsarv",
      "kulturarv",
      "landmark",
      "landmärke",
      "monument",
      "historic site",
      "historisk plats",
    ],
    attributes: [
      "name",
      "category",
      "region",
      "country",
      "year_inscribed",
      "danger",
      "area_hectares",
    ],
    bounds: [
      [-90, -180],
      [90, 180],
    ],
  },
  {
    id: "iss-position",
    endpoint: "/api/iss",
    label: "ISS Current Position",
    description:
      "Real-time position of the International Space Station. Includes altitude, velocity, and visibility.",
    geometryType: "Point",
    topics: [
      "iss",
      "international space station",
      "space station",
      "rymdstation",
      "satellite",
      "satellit",
      "orbit",
      "omloppsbana",
    ],
    attributes: ["name", "altitude_km", "velocity_kmh", "visibility"],
    bounds: [
      [-90, -180],
      [90, 180],
    ],
  },
  {
    id: "volcanoes",
    endpoint: "/api/volcanoes",
    label: "Major Volcanoes Worldwide",
    description:
      "30 notable volcanoes worldwide with elevation, type, and country. Includes active, dormant, and historically significant volcanoes.",
    geometryType: "Point",
    topics: [
      "volcano",
      "volcanoes",
      "volcanic",
      "eruption",
      "vulkan",
      "vulkaner",
      "vulkanisk",
      "utbrott",
      "lava",
      "magma",
      "caldera",
    ],
    attributes: ["name", "elevation", "country", "type"],
    bounds: [
      [-90, -180],
      [90, 180],
    ],
  },
];

// ─── Matching ────────────────────────────────────────────────

/**
 * Stop words — common words that should not count as "extra content" in a prompt.
 * Used to detect whether a prompt has a specific metric beyond geography scope.
 */
const STOP_WORDS = new Set([
  // English
  "a", "an", "the", "in", "on", "by", "for", "of", "to", "and", "or", "with",
  "per", "from", "over", "show", "map", "display", "create", "make", "build",
  "me", "my", "i", "want", "need", "please", "can", "could", "how", "many",
  "all", "each", "every", "most", "some", "that", "this", "it", "is", "are",
  "was", "were", "be", "been", "being", "have", "has", "had", "do", "does",
  "did", "will", "would", "shall", "should", "may", "might", "must",
  "not", "no", "but", "if", "then", "than", "so", "very", "too", "also",
  "just", "only", "about", "up", "out", "into", "between", "through", "after",
  "before", "during", "without", "within", "across", "around", "along",
  "where", "when", "what", "which", "who", "whom", "whose",
  "colored", "sized", "grouped", "sorted", "filtered", "compared",
  "3d", "interactive", "hover", "click", "popup", "tooltip", "label", "labels",
  // Swedish
  "och", "i", "på", "för", "av", "till", "med", "från", "över", "under",
  "en", "ett", "den", "det", "de", "som", "att", "är", "var", "har",
  "ska", "kan", "vill", "visa", "skapa", "bygg", "karta",
  "jag", "vi", "man", "alla", "varje", "sin", "sitt", "sina",
  // Historical context words
  "during", "extent", "peak", "greatest", "height", "fall", "rise",
  "age", "era", "period", "century", "conquest", "before", "after",
  "utbredning", "höjdpunkt", "storhetstid", "under", "före", "efter",
  "erövrning", "tid", "tidsålder", "århundrade",
  // Continents/regions (not specific metrics)
  "europe", "europa", "asia", "asien", "africa", "afrika",
  "scandinavia", "skandinavien", "americas",
]);

/**
 * Words indicating the user wants sub-national (state, province, county) data.
 * Catalog entries with global/country-level bounds should not match these prompts.
 */
const SUBNATIONAL_KEYWORDS = [
  // English
  "state", "states", "province", "provinces", "county", "counties",
  "region", "regions", "district", "districts", "municipality", "municipalities",
  "prefecture", "prefectures",
  // German
  "bundesland", "bundesländer", "kreis", "kreise", "landkreis", "landkreise",
  // French
  "département", "départements", "région", "régions",
  // Spanish
  "comunidad", "comunidades", "provincia", "provincias",
  // Italian
  "regione", "regioni",
  // Swedish
  "län", "kommun", "kommuner",
  // Norwegian
  "fylke", "fylker",
  // Danish/Finnish
  "maakunta",
  // Generic sub-national indicators
  "subnational", "sub-national", "federal",
];

/**
 * Find catalog entries whose topics match keywords in the prompt.
 * Returns entries sorted by number of topic hits (best match first).
 *
 * Avoids false positives by checking:
 * 1. If the prompt contains a specific metric not in the entry's attributes/topics
 * 2. If the prompt asks for sub-national data that the entry can't provide
 */
export function matchCatalog(prompt: string): CatalogEntry[] {
  const lower = prompt.toLowerCase();
  const words = lower.split(/\s+/);

  // Check if prompt asks for sub-national data
  const wantsSubnational = SUBNATIONAL_KEYWORDS.some((kw) => words.includes(kw));

  // Extract content words from the prompt (non-stop, non-geographic-scope words)
  const contentWords = words.filter((w) => !STOP_WORDS.has(w) && w.length > 2);

  const scored = DATA_CATALOG.map((entry) => {
    let hits = 0;
    const matchedTopicWords = new Set<string>();
    for (const topic of entry.topics) {
      if (lower.includes(topic)) {
        hits++;
        // Track which prompt words were matched by topics
        for (const w of topic.split(/\s+/)) matchedTopicWords.add(w);
      }
      if (words.includes(topic)) {
        hits++;
        matchedTopicWords.add(topic);
      }
    }

    // Check if the prompt has substantive content beyond what the entry covers.
    // If the user asks for a specific metric (e.g. "hundägare", "deforestation",
    // "crime rate") and the entry doesn't cover it, don't match.
    if (hits > 0 && hits < 3) {
      const unmatchedContent = contentWords.filter((w) => {
        if (matchedTopicWords.has(w)) return false;
        // Also check if word matches an attribute
        if (entry.attributes.some((a) => a.includes(w) || w.includes(a))) return false;
        // Check sub-national keywords separately (handled below)
        if (SUBNATIONAL_KEYWORDS.includes(w)) return false;
        return true;
      });
      // If there are significant unmatched content words, the prompt is asking
      // for something this entry can't provide
      if (unmatchedContent.length >= 2) {
        hits = 0;
      }
    }

    // Penalize: prompt wants sub-national but entry is country/global level
    if (wantsSubnational && entry.id === "world-countries") {
      hits = 0;
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
