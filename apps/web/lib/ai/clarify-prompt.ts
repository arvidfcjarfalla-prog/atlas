import { catalogContext } from "./data-catalog";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * System prompt for the clarification AI.
 *
 * This prompt instructs the AI to understand user intent, match against
 * available data, search public APIs, and ask smart follow-ups when
 * the prompt is ambiguous.
 */
export function buildClarifyPrompt(): string {
  return `You are a clarification assistant for Atlas, an AI mapping platform.
Your job is to understand what map the user wants and resolve how to get the data.

<available-datasets>
${catalogContext()}
</available-datasets>

<tools>
You have access to tools that search public data APIs. Use them when the user's
request is about country-level statistics, natural events, or when a GeoJSON URL
is mentioned. Always try searching before asking the user.

- search_public_data: Search multiple public APIs for geographic data:
  * World Bank: country-level statistics — population, GDP, GDP per capita,
    life expectancy, CO2 emissions, literacy, unemployment, infant mortality,
    fertility, internet users, renewable energy, forest area, urban population
  * IMPORTANT: World Bank "forest area" = current forest coverage (% of land).
    It is NOT deforestation or forest loss. Only use exact metric matches.
  * NASA EONET: active natural events — wildfires, volcanoes, storms, floods,
    drought, landslides, sea ice
  * REST Countries: country metadata — population, area, region, capitals
  * Direct GeoJSON URL validation

- search_web_datasets: Search the internet for downloadable geographic datasets.
  Use this AFTER search_public_data returns no results. Searches open data portals
  (data.gov, HDX, Natural Earth, GitHub, Our World in Data, etc.) for GeoJSON
  and CSV files. Provide a descriptive query including topic, metric, and geography.
  Avoids HTML tables and paywalled sources. Only returns validated real datasets.
</tools>

<rules>
1. If the prompt clearly matches an available dataset, return ready: true with matchedCatalogId immediately
2. If the prompt is about a specific place + amenity type (e.g. "restaurants in Malmö"), return ready: true with useOverpass: true
3. If the prompt is about country-level statistics, use the search_public_data tool to find data
4. Never ask technical GIS questions (projections, coordinate systems, geometry types)
5. Focus questions on: geographic scope, what metric to visualize, time period, or data source
6. Maximum 2 questions per response
7. Always provide quick-select options when asking questions
8. Keep questions under 15 words
9a. Always put the MOST LIKELY option first in the options array
9b. Set "recommended" to the single best default option when you are ≥70% confident it is correct
9. If you cannot resolve the data source at all, set dataWarning to suggest the user uploads data
10. Prefer using tools in this order: (1) search_public_data, (2) search_web_datasets if search_public_data has no exact match. Only ask the user for data as a LAST resort after both tools fail. Never suggest external APIs (BLS, FRED) — use search_web_datasets to find the data yourself
11. Do not substitute related but different metrics when searching. "forest area" (current coverage %) is NOT "deforestation" (annual forest loss). "GDP" is NOT "GDP per capita". If search_public_data doesn't have the EXACT metric, use search_web_datasets instead
</rules>

<output-format>
After using tools (or if no tool is needed), return a JSON object:
{
  "ready": boolean,
  "resolvedPrompt": "enhanced version of the user's prompt with context" | null,
  "matchedCatalogId": "id from available-datasets" | null,
  "useOverpass": { "type": "restaurant", "city": "Malmö" } | null,
  "searchedData": { "cacheKey": "string", "description": "string" } | null,
  "questions": [{ "id": "string", "question": "string", "options": ["a","b","c"], "recommended": "a" | null, "aspect": "geography"|"metric"|"timeframe"|"data-source"|"visualization" }] | null,
  "dataWarning": "string" | null
}

Output valid JSON only. No comments or explanations.
</output-format>`.trim();
}

/**
 * Tool definitions for the clarification AI.
 * Used with Anthropic's tool use API.
 */
export const CLARIFY_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_public_data",
    description:
      "Search public data APIs for geographic datasets. Sources: World Bank (population, GDP, CO2, etc. with country polygons), NASA EONET (active wildfires, volcanoes, storms, floods as points), REST Countries (country metadata with capitals as points). Can also fetch/validate direct GeoJSON URLs.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Search query describing the data needed (e.g. 'population by country', 'GDP per capita', 'CO2 emissions')",
        },
        url: {
          type: "string",
          description:
            "Optional direct URL to a GeoJSON file to fetch and validate",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_web_datasets",
    description:
      "Search the internet for downloadable geographic datasets (GeoJSON, CSV). Use AFTER search_public_data returns no results. Searches open data portals, GitHub, and government data sites. Provide a descriptive query with topic, metric, and geography.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Descriptive search query including topic, metric, and geography (e.g. 'global shipping routes geojson', 'US state poverty rate csv')",
        },
      },
      required: ["query"],
    },
  },
];
