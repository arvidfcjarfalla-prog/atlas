import type { MapFamily } from "@atlas/data-models";
import type { ProfileGeometryType, DatasetProfile } from "./types";
import type { GenSkill } from "./skills/router";

// ─── Types ───────────────────────────────────────────────────

export interface FewShotExample {
  id: string;
  /** Map families this example demonstrates. */
  families: MapFamily[];
  /** Whether the example includes a dataset-profile block. */
  hasProfile: boolean;
  /** Geometry types this example is relevant for. */
  geometryTypes: ProfileGeometryType[];
  /** Generation skills this example is relevant for. */
  genSkills: GenSkill[];
  /** User prompt text. */
  prompt: string;
  /** Dataset-profile XML block (only for with-profile examples). */
  profile?: string;
  /** Full JSON output. */
  output: string;
}

// ─── Example bank ────────────────────────────────────────────

export const EXAMPLES: FewShotExample[] = [
  {
    id: "earthquakes-weekly",
    families: ["cluster", "point"],
    hasProfile: false,
    geometryTypes: ["Point", "MultiPoint"],
    genSkills: ["locational", "general"],
    prompt: "Visa alla jordbävningar senaste veckan, färgade efter magnitud",
    output: `{
  "version": 2,
  "id": "earthquakes-weekly",
  "title": "Earthquakes — Last 7 Days",
  "description": "Global earthquake activity from USGS, colored by magnitude severity.",
  "theme": "explore",
  "defaultCenter": [20, 0],
  "defaultZoom": 2,
  "defaultPitch": 15,
  "basemap": {
    "hillshade": true,
    "nightlights": true,
    "landMask": true,
    "tectonic": true
  },
  "layers": [
    {
      "id": "earthquakes",
      "kind": "event",
      "label": "Earthquakes",
      "sourceType": "api",
      "sourceUrl": "/api/earthquakes",
      "geometryType": "point",
      "style": {
        "markerShape": "circle",
        "mapFamily": "cluster",
        "colorField": "severity",
        "sizeField": "magnitude",
        "clusterEnabled": true,
        "clusterRadius": 50,
        "color": {
          "scheme": "reds",
          "colorblindSafe": true
        }
      },
      "legend": {
        "title": "Magnitude",
        "type": "categorical"
      },
      "interaction": {
        "tooltipFields": ["title", "magnitude", "depth"],
        "clickBehavior": "detail-panel",
        "hoverEffect": "highlight"
      },
      "attribution": "USGS Earthquake Hazards Program"
    }
  ],
  "accessibility": {
    "colorblindSafe": true,
    "contrastTarget": "AA",
    "locale": "sv"
  },
  "intent": {
    "userPrompt": "Visa alla jordbävningar senaste veckan, färgade efter magnitud",
    "taskType": "monitor-events",
    "confidence": 0.95,
    "assumptions": [
      "Data source is USGS earthquake feed",
      "Severity is derived from magnitude brackets",
      "Clustering enabled due to likely > 500 events in a week"
    ]
  },
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}`,
  },
  {
    id: "housing-prices",
    families: ["choropleth"],
    hasProfile: false,
    geometryTypes: ["Polygon", "MultiPolygon"],
    genSkills: ["thematic", "general"],
    prompt: "Visa bostadspriser per kommun i Stockholms län",
    output: `{
  "version": 2,
  "id": "housing-prices-stockholm",
  "title": "Bostadspriser per kommun — Stockholms län",
  "description": "Median housing price per square meter by municipality in Stockholm County.",
  "theme": "decision",
  "defaultCenter": [59.33, 18.07],
  "defaultZoom": 9,
  "layers": [
    {
      "id": "municipalities",
      "kind": "zone",
      "label": "Kommuner",
      "sourceType": "geojson-url",
      "sourceUrl": "/api/user-data/current",
      "geometryType": "polygon",
      "style": {
        "markerShape": "circle",
        "mapFamily": "choropleth",
        "colorField": "median_price_sqm",
        "classification": {
          "method": "quantile",
          "classes": 5
        },
        "color": {
          "scheme": "blues",
          "colorblindSafe": true
        },
        "normalization": {
          "field": "area_sqm",
          "method": "per-area"
        },
        "fillOpacity": 0.85,
        "strokeColor": "rgba(255,255,255,0.4)",
        "strokeWidth": 1,
        "labelField": "kommunnamn"
      },
      "legend": {
        "title": "Pris per kvm (SEK)",
        "type": "gradient"
      },
      "interaction": {
        "tooltipFields": ["kommunnamn", "median_price_sqm", "antal_forsaljningar"],
        "clickBehavior": "detail-panel",
        "hoverEffect": "highlight"
      },
      "attribution": "SCB / Lantmäteriet"
    }
  ],
  "accessibility": {
    "colorblindSafe": true,
    "contrastTarget": "AA",
    "locale": "sv"
  },
  "intent": {
    "userPrompt": "Visa bostadspriser per kommun i Stockholms län",
    "taskType": "compare-regions",
    "confidence": 0.90,
    "assumptions": [
      "Data must be provided by user — no built-in municipality price dataset",
      "Municipality boundaries assumed available as polygon GeoJSON",
      "Quantile classification chosen for skewed price distribution",
      "normalization.field set to area_sqm as price is already per-sqm — this may be redundant"
    ]
  },
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}`,
  },
  {
    id: "burglaries",
    families: ["heatmap"],
    hasProfile: false,
    geometryTypes: ["Point", "MultiPoint"],
    genSkills: ["locational", "general"],
    prompt: "Var sker flest inbrott i Göteborg?",
    output: `{
  "version": 2,
  "id": "burglary-density-gothenburg",
  "title": "Inbrottstäthet — Göteborg",
  "description": "Density map of reported burglaries in Gothenburg, showing concentration hotspots.",
  "theme": "decision",
  "defaultCenter": [57.71, 11.97],
  "defaultZoom": 11,
  "layers": [
    {
      "id": "burglaries",
      "kind": "event",
      "label": "Inbrott",
      "sourceType": "geojson-url",
      "sourceUrl": "/api/user-data/current",
      "geometryType": "point",
      "style": {
        "markerShape": "circle",
        "mapFamily": "heatmap",
        "maxZoom": 9,
        "color": {
          "scheme": "inferno",
          "colorblindSafe": true
        }
      },
      "legend": {
        "title": "Inbrottstäthet",
        "type": "gradient"
      },
      "interaction": {
        "clickBehavior": "none",
        "hoverEffect": "none"
      },
      "attribution": "Polismyndigheten / BRÅ"
    }
  ],
  "accessibility": {
    "colorblindSafe": true,
    "contrastTarget": "AA",
    "locale": "sv"
  },
  "intent": {
    "userPrompt": "Var sker flest inbrott i Göteborg?",
    "taskType": "find-hotspots",
    "confidence": 0.85,
    "assumptions": [
      "Data must be provided by user — no built-in crime dataset",
      "Heatmap chosen because user asks 'where most occur' — implies density",
      "maxZoom 9 to prevent noisy rendering at street level"
    ]
  },
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}`,
  },
  {
    id: "population",
    families: ["proportional-symbol"],
    hasProfile: false,
    geometryTypes: ["Point", "MultiPoint"],
    genSkills: ["thematic", "locational", "general"],
    prompt: "Visa världens största städer, större cirkel = fler invånare",
    output: `{
  "version": 2,
  "id": "world-city-population",
  "title": "Världens största städer",
  "description": "Major world cities with circle sizes proportional to population.",
  "theme": "editorial",
  "defaultCenter": [20, 0],
  "defaultZoom": 2,
  "layers": [
    {
      "id": "cities",
      "kind": "asset",
      "label": "Städer",
      "sourceType": "geojson-url",
      "sourceUrl": "/api/geo/world-cities",
      "geometryType": "point",
      "style": {
        "markerShape": "circle",
        "mapFamily": "proportional-symbol",
        "sizeField": "pop_max",
        "colorField": "country",
        "color": {
          "scheme": "set2",
          "colorblindSafe": true
        },
        "fillOpacity": 0.7,
        "strokeColor": "rgba(255,255,255,0.5)",
        "strokeWidth": 1
      },
      "legend": {
        "title": "Befolkning",
        "type": "proportional"
      },
      "interaction": {
        "tooltipFields": ["name", "country", "pop_max"],
        "clickBehavior": "popup",
        "hoverEffect": "enlarge"
      },
      "attribution": "Natural Earth"
    }
  ],
  "accessibility": {
    "colorblindSafe": true,
    "contrastTarget": "AA",
    "locale": "sv"
  },
  "intent": {
    "userPrompt": "Visa världens största städer, större cirkel = fler invånare",
    "taskType": "compare-magnitudes",
    "confidence": 0.95,
    "assumptions": [
      "Using built-in world-cities dataset from Natural Earth",
      "pop_max field is numeric population estimate",
      "Categorical color by country adds secondary information"
    ]
  },
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}`,
  },
  {
    id: "restaurants",
    families: ["point"],
    hasProfile: false,
    geometryTypes: ["Point", "MultiPoint"],
    genSkills: ["locational", "general"],
    prompt: "Mappa alla restauranger i Stockholms innerstad",
    output: `{
  "version": 2,
  "id": "stockholm-restaurants",
  "title": "Restauranger — Stockholms innerstad",
  "description": "Individual restaurant locations in central Stockholm.",
  "theme": "explore",
  "defaultCenter": [59.33, 18.07],
  "defaultZoom": 13,
  "layers": [
    {
      "id": "restaurants",
      "kind": "asset",
      "label": "Restauranger",
      "sourceType": "geojson-url",
      "sourceUrl": "/api/user-data/current",
      "geometryType": "point",
      "style": {
        "markerShape": "circle",
        "mapFamily": "point",
        "clusterEnabled": false,
        "color": {
          "scheme": "oranges",
          "colorblindSafe": true
        }
      },
      "interaction": {
        "tooltipFields": ["name", "cuisine", "rating"],
        "clickBehavior": "popup",
        "hoverEffect": "highlight"
      },
      "attribution": "OpenStreetMap"
    }
  ],
  "accessibility": {
    "colorblindSafe": true,
    "contrastTarget": "AA",
    "locale": "sv"
  },
  "intent": {
    "userPrompt": "Mappa alla restauranger i Stockholms innerstad",
    "taskType": "browse-places",
    "confidence": 0.90,
    "assumptions": [
      "Data must be provided by user — no built-in restaurant dataset",
      "Inner city area keeps feature count manageable (< 500), no clustering needed",
      "Zoom 13 appropriate for city-center browsing"
    ]
  },
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}`,
  },
  {
    id: "earthquakes-daily",
    families: ["point"],
    hasProfile: true,
    geometryTypes: ["Point", "MultiPoint"],
    genSkills: ["locational", "general"],
    prompt: "Visa jordbävningar senaste dygnet",
    profile: `{
  "featureCount": 143,
  "geometryType": "Point",
  "bounds": [[-58.47, -179.31], [66.24, 179.96]],
  "crs": null,
  "attributes": [
    { "name": "mag", "type": "number", "uniqueValues": 89, "nullCount": 2, "min": 2.5, "max": 6.1, "mean": 3.42, "median": 3.1, "distribution": "skewed-right" },
    { "name": "place", "type": "string", "uniqueValues": 140, "nullCount": 0, "sampleValues": ["15 km SSW of Volcano, Hawaii", "32 km SE of Ridgecrest, CA", "South Sandwich Islands region"] },
    { "name": "time", "type": "number", "uniqueValues": 143, "nullCount": 0, "min": 1710000000000, "max": 1710086400000, "distribution": "uniform" },
    { "name": "depth", "type": "number", "uniqueValues": 130, "nullCount": 0, "min": 0, "max": 610, "mean": 33.5, "median": 10.2, "distribution": "skewed-right" },
    { "name": "title", "type": "string", "uniqueValues": 143, "nullCount": 0 },
    { "name": "tsunami", "type": "number", "uniqueValues": 2, "nullCount": 0, "min": 0, "max": 1 },
    { "name": "type", "type": "string", "uniqueValues": 2, "nullCount": 0, "sampleValues": ["earthquake", "quarry blast"] }
  ]
}`,
    output: `{
  "version": 2,
  "id": "earthquakes-daily",
  "title": "Jordbävningar — Senaste 24h",
  "description": "Global seismic activity from USGS, sized by magnitude and colored by depth.",
  "theme": "explore",
  "defaultCenter": [3.89, 0.33],
  "defaultZoom": 2,
  "defaultPitch": 0,
  "basemap": {
    "hillshade": false,
    "nightlights": true,
    "landMask": true,
    "tectonic": true
  },
  "layers": [
    {
      "id": "earthquakes",
      "kind": "event",
      "label": "Jordbävningar",
      "sourceType": "api",
      "sourceUrl": "/api/earthquakes",
      "geometryType": "point",
      "style": {
        "markerShape": "circle",
        "mapFamily": "point",
        "colorField": "depth",
        "sizeField": "mag",
        "clusterEnabled": false,
        "classification": {
          "method": "natural-breaks",
          "classes": 5
        },
        "color": {
          "scheme": "plasma",
          "colorblindSafe": true
        },
        "fillOpacity": 0.8,
        "strokeColor": "rgba(255,255,255,0.6)",
        "strokeWidth": 1
      },
      "legend": {
        "title": "Djup (km)",
        "type": "gradient"
      },
      "interaction": {
        "tooltipFields": ["title", "mag", "depth", "place"],
        "clickBehavior": "popup",
        "hoverEffect": "enlarge"
      },
      "attribution": "USGS Earthquake Hazards Program"
    }
  ],
  "accessibility": {
    "colorblindSafe": true,
    "contrastTarget": "AA",
    "locale": "sv"
  },
  "intent": {
    "userPrompt": "Visa jordbävningar senaste dygnet",
    "taskType": "monitor-events",
    "confidence": 0.95,
    "assumptions": [
      "143 features < 500 threshold, using point instead of cluster",
      "colorField 'depth' chosen because 'mag' is used for sizeField — avoids double-encoding",
      "natural-breaks for depth because distribution is skewed-right",
      "Bounds span nearly full globe → defaultZoom 2",
      "nightlights + tectonic basemap relevant for seismic context"
    ]
  },
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}`,
  },
  {
    id: "tax-rates",
    families: ["choropleth"],
    hasProfile: true,
    geometryTypes: ["Polygon", "MultiPolygon"],
    genSkills: ["thematic", "general"],
    prompt: "Jämför kommunernas skattesats",
    profile: `{
  "featureCount": 290,
  "geometryType": "MultiPolygon",
  "bounds": [[55.34, 11.11], [69.06, 24.17]],
  "crs": null,
  "attributes": [
    { "name": "kommun_kod", "type": "string", "uniqueValues": 290, "nullCount": 0 },
    { "name": "kommun_namn", "type": "string", "uniqueValues": 290, "nullCount": 0, "sampleValues": ["Stockholm", "Gothenburg", "Malmö", "Uppsala", "Linköping"] },
    { "name": "total_skatt", "type": "number", "uniqueValues": 148, "nullCount": 0, "min": 29.18, "max": 35.15, "mean": 32.62, "median": 32.75, "distribution": "normal" },
    { "name": "kommunal_skatt", "type": "number", "uniqueValues": 112, "nullCount": 0, "min": 17.04, "max": 23.50, "mean": 21.38, "median": 21.54, "distribution": "normal" },
    { "name": "invånare", "type": "number", "uniqueValues": 290, "nullCount": 0, "min": 2450, "max": 984748, "mean": 35862, "median": 16421, "distribution": "skewed-right" },
    { "name": "landsting", "type": "string", "uniqueValues": 21, "nullCount": 0, "sampleValues": ["Stockholm", "Västra Götaland", "Skåne", "Östergötland"] }
  ]
}`,
    output: `{
  "version": 2,
  "id": "sweden-tax-rates",
  "title": "Kommunal skattesats — Sverige",
  "description": "Total tax rate by municipality across Sweden, enabling regional comparison.",
  "theme": "decision",
  "defaultCenter": [62.20, 17.64],
  "defaultZoom": 5,
  "defaultPitch": 0,
  "layers": [
    {
      "id": "municipalities",
      "kind": "zone",
      "label": "Kommuner",
      "sourceType": "geojson-url",
      "sourceUrl": "/api/user-data/current",
      "geometryType": "multi-polygon",
      "style": {
        "markerShape": "circle",
        "mapFamily": "choropleth",
        "colorField": "total_skatt",
        "classification": {
          "method": "quantile",
          "classes": 5
        },
        "color": {
          "scheme": "blue-red",
          "colorblindSafe": true
        },
        "fillOpacity": 0.85,
        "strokeColor": "rgba(0,0,0,0.15)",
        "strokeWidth": 0.5
      },
      "legend": {
        "title": "Total skattesats (%)",
        "type": "gradient"
      },
      "interaction": {
        "tooltipFields": ["kommun_namn", "total_skatt", "kommunal_skatt", "invånare"],
        "clickBehavior": "detail-panel",
        "hoverEffect": "highlight"
      },
      "attribution": "SCB"
    }
  ],
  "accessibility": {
    "colorblindSafe": true,
    "contrastTarget": "AA",
    "locale": "sv"
  },
  "intent": {
    "userPrompt": "Jämför kommunernas skattesats",
    "taskType": "compare-regions",
    "confidence": 0.92,
    "assumptions": [
      "total_skatt chosen over kommunal_skatt — user said 'skattesats' without qualifier, total is more informative",
      "quantile classification because distribution is normal — gives balanced class sizes",
      "blue-red diverging scheme highlights low vs high tax municipalities",
      "No normalization needed — tax rate is already a percentage",
      "Bounds cover all of Sweden → defaultZoom 5"
    ]
  },
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}`,
  },
  {
    id: "commuting",
    families: ["flow"],
    hasProfile: true,
    geometryTypes: ["LineString", "MultiLineString"],
    genSkills: ["flow", "general"],
    prompt: "Visa pendlingsflöden mellan kommuner i Skåne",
    profile: `{
  "featureCount": 87,
  "geometryType": "LineString",
  "bounds": [[55.34, 12.45], [56.45, 14.37]],
  "crs": null,
  "attributes": [
    { "name": "origin", "type": "string", "uniqueValues": 28, "nullCount": 0, "sampleValues": ["Malmö", "Lund", "Helsingborg", "Kristianstad"] },
    { "name": "destination", "type": "string", "uniqueValues": 28, "nullCount": 0, "sampleValues": ["Malmö", "Lund", "Helsingborg", "Landskrona"] },
    { "name": "commuters", "type": "number", "uniqueValues": 82, "nullCount": 0, "min": 45, "max": 18200, "mean": 2340, "median": 890, "distribution": "skewed-right" },
    { "name": "mode", "type": "string", "uniqueValues": 3, "nullCount": 0, "sampleValues": ["car", "train", "bus"] },
    { "name": "distance_km", "type": "number", "uniqueValues": 75, "nullCount": 0, "min": 5, "max": 95, "mean": 32, "median": 28, "distribution": "normal" }
  ]
}`,
    output: `{
  "version": 2,
  "id": "skane-commuter-flows",
  "title": "Pendlingsflöden — Skåne",
  "description": "Inter-municipal commuting flows in Skåne, line width proportional to number of commuters.",
  "theme": "decision",
  "defaultCenter": [55.90, 13.41],
  "defaultZoom": 8,
  "defaultPitch": 0,
  "layers": [
    {
      "id": "commuter-flows",
      "kind": "route",
      "label": "Pendlingsflöden",
      "sourceType": "geojson-url",
      "sourceUrl": "/api/user-data/current",
      "geometryType": "line",
      "style": {
        "markerShape": "circle",
        "mapFamily": "flow",
        "colorField": "mode",
        "color": {
          "scheme": "set2",
          "colorblindSafe": true
        },
        "fillOpacity": 0.7
      },
      "flow": {
        "originField": "origin",
        "destinationField": "destination",
        "weightField": "commuters",
        "minWidth": 1,
        "maxWidth": 10
      },
      "legend": {
        "title": "Transportmedel",
        "type": "flow"
      },
      "interaction": {
        "tooltipFields": ["origin", "destination", "commuters", "mode"],
        "clickBehavior": "detail-panel",
        "hoverEffect": "highlight"
      },
      "attribution": "SCB / Trafikanalys"
    }
  ],
  "accessibility": {
    "colorblindSafe": true,
    "contrastTarget": "AA",
    "locale": "sv"
  },
  "intent": {
    "userPrompt": "Visa pendlingsflöden mellan kommuner i Skåne",
    "taskType": "show-movement",
    "confidence": 0.93,
    "assumptions": [
      "Data is pre-processed as LineString features with origin/destination properties",
      "commuters field drives line width — skewed-right so thick lines for Malmö–Lund corridor",
      "mode field as colorField gives categorical coloring by transport type",
      "87 flows is manageable without filtering",
      "Bounds span Skåne → defaultZoom 8"
    ]
  },
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}`,
  },
  {
    id: "isochrone-cycling",
    families: ["isochrone"],
    hasProfile: false,
    geometryTypes: ["Polygon", "MultiPolygon"],
    genSkills: ["general"],
    prompt: "Hur långt når man från Malmö centralstation på 10, 20 och 30 minuter med cykel?",
    output: `{
  "version": 2,
  "id": "malmo-cycling-isochrone",
  "title": "Cykelräckvidd — Malmö C",
  "description": "Cycling accessibility zones from Malmö Central Station at 10, 20, and 30 minute intervals.",
  "theme": "explore",
  "defaultCenter": [55.61, 13.00],
  "defaultZoom": 12,
  "defaultPitch": 0,
  "layers": [
    {
      "id": "cycling-zones",
      "kind": "zone",
      "label": "Cykelzoner",
      "sourceType": "geojson-url",
      "sourceUrl": "/api/isochrone?origin=55.61,13.00&mode=cycling&breaks=10,20,30",
      "geometryType": "polygon",
      "style": {
        "markerShape": "circle",
        "mapFamily": "isochrone",
        "colorField": "value",
        "color": {
          "scheme": "greens",
          "colorblindSafe": true
        },
        "fillOpacity": 0.45,
        "strokeColor": "rgba(255,255,255,0.6)",
        "strokeWidth": 1.5
      },
      "isochrone": {
        "mode": "cycling",
        "breakpoints": [10, 20, 30],
        "unit": "minutes",
        "origin": [55.61, 13.00]
      },
      "legend": {
        "title": "Cykeltid",
        "type": "gradient"
      },
      "interaction": {
        "tooltipFields": ["value"],
        "clickBehavior": "popup",
        "hoverEffect": "highlight"
      },
      "attribution": "OpenRouteService"
    }
  ],
  "accessibility": {
    "colorblindSafe": true,
    "contrastTarget": "AA",
    "locale": "sv"
  },
  "intent": {
    "userPrompt": "Hur långt når man från Malmö centralstation på 10, 20 och 30 minuter med cykel?",
    "taskType": "show-accessibility",
    "confidence": 0.92,
    "assumptions": [
      "Isochrone polygons are pre-computed by a routing API (e.g. OpenRouteService)",
      "Each polygon feature has a 'value' property matching the breakpoint in minutes",
      "greens scheme chosen — darker green = longer travel time",
      "Lower fillOpacity (0.45) because zones overlap",
      "origin derived from Malmö Central Station coordinates"
    ]
  },
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}`,
  },
  {
    id: "taxi-hexbin",
    families: ["hexbin"],
    hasProfile: true,
    geometryTypes: ["Point", "MultiPoint"],
    genSkills: ["locational", "general"],
    prompt: "Visa täthet av taxiresor i New York med hexagoner",
    profile: `{
  "featureCount": 5200,
  "geometryType": "Point",
  "bounds": [[40.63, -74.05], [40.88, -73.77]],
  "crs": null,
  "attributes": [
    { "name": "fare", "type": "number", "uniqueValues": 3800, "nullCount": 12, "min": 2.5, "max": 250, "mean": 14.2, "median": 10.5, "distribution": "skewed-right" },
    { "name": "passengers", "type": "number", "uniqueValues": 6, "nullCount": 0, "min": 1, "max": 6, "mean": 1.7, "distribution": "skewed-right" },
    { "name": "trip_distance", "type": "number", "uniqueValues": 4100, "nullCount": 0, "min": 0.1, "max": 45, "mean": 3.2, "distribution": "skewed-right" }
  ]
}`,
    output: `{
  "version": 2,
  "id": "nyc-taxi-hexbin",
  "title": "NYC Taxi Trip Density — Hexagonal Bins",
  "description": "Hexagonal binning of taxi pickup locations in New York City, colored by trip count per cell.",
  "theme": "explore",
  "defaultCenter": [40.76, -73.91],
  "defaultZoom": 11,
  "basemap": { "nightlights": true },
  "layers": [
    {
      "id": "taxi-hexbins",
      "kind": "event",
      "label": "Taxi pickups",
      "sourceType": "geojson-url",
      "sourceUrl": "/api/user-data/current",
      "geometryType": "point",
      "hexbin": { "resolution": 7, "aggregation": "mean", "aggregationField": "fare" },
      "style": {
        "markerShape": "circle",
        "mapFamily": "hexbin",
        "classification": { "method": "quantile", "classes": 7 },
        "color": { "scheme": "viridis", "colorblindSafe": true },
        "fillOpacity": 0.8,
        "strokeColor": "rgba(255,255,255,0.15)",
        "strokeWidth": 0.5
      },
      "legend": { "title": "Average fare ($)", "type": "gradient" },
      "interaction": {
        "tooltipFields": ["_hex_value", "_hex_count"],
        "clickBehavior": "popup",
        "hoverEffect": "highlight"
      },
      "attribution": "NYC TLC"
    }
  ],
  "accessibility": { "colorblindSafe": true, "contrastTarget": "AA", "locale": "en" },
  "intent": {
    "userPrompt": "Visa täthet av taxiresor i New York med hexagoner",
    "taskType": "density-analysis",
    "confidence": 0.90,
    "assumptions": [
      "5200 points binned into H3 resolution 7 hexagons",
      "Aggregation: mean fare per hex cell",
      "viridis scheme works well for density on dark basemap"
    ]
  },
  "validation": { "valid": true, "errors": [], "warnings": [] }
}`,
  },
  {
    id: "school-buffer-zones",
    families: ["choropleth"],
    hasProfile: true,
    geometryTypes: ["Point", "MultiPoint"],
    genSkills: ["locational", "general"],
    prompt: "Visa 1 km bufferzoner runt alla skolor",
    profile: `{
  "featureCount": 85,
  "geometryType": "Point",
  "bounds": [[59.28, 17.90], [59.42, 18.20]],
  "crs": null,
  "attributes": [
    { "name": "name", "type": "string", "uniqueValues": 85, "nullCount": 0, "sampleValues": ["Örskolan", "Bredängsskolan", "Skarpnäcks skola"] },
    { "name": "students", "type": "number", "uniqueValues": 78, "nullCount": 2, "min": 45, "max": 890, "mean": 340, "distribution": "normal" },
    { "name": "type", "type": "string", "uniqueValues": 3, "nullCount": 0, "sampleValues": ["grundskola", "gymnasium", "förskola"] }
  ]
}`,
    output: `{
  "version": 2,
  "id": "school-buffer-zones",
  "title": "Bufferzoner 1 km — Skolor",
  "description": "1 km buffer zones around schools in Stockholm, showing coverage areas.",
  "theme": "decision",
  "defaultCenter": [59.35, 18.05],
  "defaultZoom": 11,
  "layers": [
    {
      "id": "school-buffers",
      "kind": "zone",
      "label": "Bufferzoner",
      "sourceType": "geojson-url",
      "sourceUrl": "/api/user-data/current",
      "geometryType": "point",
      "transform": { "type": "buffer", "distance": 1, "units": "kilometers" },
      "style": {
        "markerShape": "circle",
        "mapFamily": "choropleth",
        "colorField": "type",
        "classification": { "method": "categorical", "classes": 3 },
        "color": { "scheme": "set2", "colorblindSafe": true },
        "fillOpacity": 0.4,
        "strokeColor": "rgba(255,255,255,0.5)",
        "strokeWidth": 1
      },
      "legend": { "title": "Skoltyp", "type": "categorical" },
      "interaction": {
        "tooltipFields": ["name", "type", "students"],
        "clickBehavior": "popup",
        "hoverEffect": "highlight"
      },
      "attribution": "Skolverket"
    }
  ],
  "accessibility": { "colorblindSafe": true, "contrastTarget": "AA", "locale": "sv" },
  "intent": {
    "userPrompt": "Visa 1 km bufferzoner runt alla skolor",
    "taskType": "coverage-analysis",
    "confidence": 0.90,
    "assumptions": [
      "Buffer transform converts points to 1 km polygons",
      "Categorical coloring by school type (grundskola/gymnasium/förskola)",
      "Low fillOpacity because buffer zones overlap"
    ]
  },
  "validation": { "valid": true, "errors": [], "warnings": [] }
}`,
  },
];

// ─── With-profile examples by geometry group ─────────────────

const PROFILE_EXAMPLE_BY_GEOMETRY: Record<string, string> = {
  Point: "earthquakes-daily",
  MultiPoint: "earthquakes-daily",
  Polygon: "tax-rates",
  MultiPolygon: "tax-rates",
  LineString: "commuting",
  MultiLineString: "commuting",
  Mixed: "earthquakes-daily",
};

// ─── Geometry group mapping ──────────────────────────────────

type GeometryGroup = "point" | "polygon" | "line";

function geometryGroup(gt: ProfileGeometryType): GeometryGroup {
  switch (gt) {
    case "Point":
    case "MultiPoint":
      return "point";
    case "Polygon":
    case "MultiPolygon":
      return "polygon";
    case "LineString":
    case "MultiLineString":
      return "line";
    case "Mixed":
      return "point";
  }
}

function exampleMatchesGroup(ex: FewShotExample, group: GeometryGroup): boolean {
  return ex.geometryTypes.some((gt) => geometryGroup(gt) === group);
}

// ─── Selector ────────────────────────────────────────────────

/**
 * Select relevant few-shot examples based on a dataset profile and optional skill.
 *
 * - Without profile: returns all examples (no risk of regression).
 * - With profile: returns `count` examples maximizing family coverage
 *   for the given geometry type.
 * - With skill: prefers examples tagged for that skill.
 */
export function selectExamples(
  profile?: DatasetProfile,
  count?: number,
  skill?: GenSkill,
): FewShotExample[] {
  const effectiveCount = count ?? (profile && skill && skill !== "general" ? 2 : 3);
  if (!profile) {
    // Without profile but with skill, filter to skill-relevant examples
    if (skill && skill !== "general") {
      const skillExamples = EXAMPLES.filter((e) => e.genSkills.includes(skill));
      return skillExamples.length >= 2 ? skillExamples : EXAMPLES;
    }
    return EXAMPLES;
  }

  const group = geometryGroup(profile.geometryType);
  const selected: FewShotExample[] = [];
  const seenFamilies = new Set<MapFamily>();

  // Slot 1: with-profile example matching the geometry type
  const profileExampleId = PROFILE_EXAMPLE_BY_GEOMETRY[profile.geometryType];
  const profileExample = EXAMPLES.find((e) => e.id === profileExampleId);
  if (profileExample) {
    selected.push(profileExample);
    for (const f of profileExample.families) seenFamilies.add(f);
  }

  // Slot 2+: from remaining examples matching the geometry, maximize family coverage
  // When skill is set, prefer examples matching that skill
  const remaining = EXAMPLES.filter(
    (e) => !selected.includes(e) && exampleMatchesGroup(e, group),
  );

  // Sort by: skill relevance (descending) then unseen families (descending)
  remaining.sort((a, b) => {
    if (skill && skill !== "general") {
      const aSkill = a.genSkills.includes(skill) ? 1 : 0;
      const bSkill = b.genSkills.includes(skill) ? 1 : 0;
      if (aSkill !== bSkill) return bSkill - aSkill;
    }
    const unseenA = a.families.filter((f) => !seenFamilies.has(f)).length;
    const unseenB = b.families.filter((f) => !seenFamilies.has(f)).length;
    return unseenB - unseenA;
  });

  for (const ex of remaining) {
    if (selected.length >= effectiveCount) break;
    selected.push(ex);
    for (const f of ex.families) seenFamilies.add(f);
  }

  // If slots remain, pad with examples from other geometry types for breadth
  if (selected.length < effectiveCount) {
    const others = EXAMPLES.filter(
      (e) => !selected.includes(e) && !exampleMatchesGroup(e, group),
    );
    others.sort((a, b) => {
      if (skill && skill !== "general") {
        const aSkill = a.genSkills.includes(skill) ? 1 : 0;
        const bSkill = b.genSkills.includes(skill) ? 1 : 0;
        if (aSkill !== bSkill) return bSkill - aSkill;
      }
      const unseenA = a.families.filter((f) => !seenFamilies.has(f)).length;
      const unseenB = b.families.filter((f) => !seenFamilies.has(f)).length;
      return unseenB - unseenA;
    });
    for (const ex of others) {
      if (selected.length >= effectiveCount) break;
      selected.push(ex);
      for (const f of ex.families) seenFamilies.add(f);
    }
  }

  return selected;
}

// ─── Formatter ───────────────────────────────────────────────

export function formatExample(ex: FewShotExample): string {
  const parts = ["<example>"];
  parts.push(`<user-prompt>${ex.prompt}</user-prompt>`);
  if (ex.profile) {
    parts.push(`<dataset-profile>\n${ex.profile}\n</dataset-profile>`);
  }
  parts.push(`<output>\n${ex.output}\n</output>`);
  parts.push("</example>");
  return parts.join("\n");
}
