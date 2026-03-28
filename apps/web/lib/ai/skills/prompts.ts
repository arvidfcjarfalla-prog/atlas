/**
 * Skill-specific prompt sections injected into the chat agent system prompt.
 *
 * Each skill adds a focused <skill-context> block that narrows the AI's
 * attention to relevant tools and rules.
 */

import type { ChatSkill } from "./router";

const STYLE_PROMPT = `<skill-context skill="style">
The user wants to change the map's visual appearance. Focus on cartographic styling.

## Rules
- Sequential data → sequential schemes (blues, viridis, greens). Diverging data (meaningful midpoint) → diverging (blue-red, spectral). Categorical → set2, paired.
- On the dark basemap, prefer blues or greens for economic data — viridis fades at the low end.
- Choropleth MUST normalize data (per-capita, per-area, %). Raw counts create area bias.
- Classification classes: 2–9. Default 7 for choropleth, 4–5 for small datasets (<20 features).
- Quantile is the default classification — even color distribution. Equal-interval only for uniform data.
- Labels: only on choropleth with ≤50 features. Disable for dense data to avoid clutter.
- fillOpacity: sparse polygons 0.8–0.9, dense/overlapping 0.4–0.6.
- Basemap: nightlights for global/dark, hillshade for terrain. labelsVisible: false for thematic maps.

## Instruction
Only call \`update_manifest\`. Do NOT search for data or call any data tools.
</skill-context>`;

const DATA_PROMPT = `<skill-context skill="data">
The user wants to find or load new data for the map.

## Search strategy
1. \`search_data\` first — for statistical data (GDP, population, unemployment, emissions).
2. \`search_poi\` — for places (restaurants, parks, hospitals) in a specific city.
3. \`search_web\` — fallback for niche datasets, country-specific portals, CSV/GeoJSON URLs.
4. \`fetch_url\` — when user provides a direct URL or you have a known dataset URL.

## After finding data
- Call \`parse_dataset\` to understand fields, types, and value ranges.
- Then call \`update_manifest\` to wire the data into the map:
  - Set layers[0].sourceUrl to the dataUrl from the tool result.
  - Set sourceType to "geojson-url".
  - Adjust colorField, sizeField, tooltipFields to match the data profile.
  - Set attribution to the exact data source with dataset identifier and year.
  - Set attributionUrl to the source homepage.

## Rules
- Never fabricate data URLs — only use URLs from tool results.
- Always set attribution when loading new data.
</skill-context>`;

const INSIGHT_PROMPT = `<skill-context skill="insight">
The user is asking an analytical question about the current map and data.

## Approach
- Analyze the current manifest and data profile to answer the question.
- Reference specific statistics: min, max, mean, distribution, feature count.
- Explain patterns, trends, and outliers visible in the data.
- Compare regions or values when asked.

## Rules
- Do NOT call any tools. Respond with text only.
- If the user needs different data to answer their question, suggest they ask for it.
- Be specific — cite actual field names and value ranges from the data profile.
</skill-context>`;

/**
 * Get the skill-specific prompt injection for a chat skill.
 * Returns empty string for "general" (uses full prompt as-is).
 */
export function getChatSkillPrompt(skill: ChatSkill): string {
  switch (skill) {
    case "style":
      return STYLE_PROMPT;
    case "data":
      return DATA_PROMPT;
    case "insight":
      return INSIGHT_PROMPT;
    case "general":
      return "";
  }
}

/**
 * Tools to enable for each chat skill.
 * Returns tool names that should be active.
 */
export function getChatSkillTools(skill: ChatSkill): Set<string> {
  switch (skill) {
    case "style":
      return new Set(["update_manifest"]);
    case "data":
      return new Set(["search_data", "search_poi", "search_web", "fetch_url", "parse_dataset", "update_manifest"]);
    case "insight":
      return new Set(); // No tools — text only
    case "general":
      return new Set(["update_manifest", "search_data", "search_poi", "search_web", "fetch_url", "parse_dataset"]);
  }
}
