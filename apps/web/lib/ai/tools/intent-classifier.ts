/**
 * Lightweight intent classifier.
 *
 * Uses Haiku to quickly classify a user prompt into a routing intent
 * so the clarify waterfall can skip irrelevant fast paths.
 *
 * Cost: ~$0.001 per call. Latency: ~200-400ms.
 */

import Anthropic from "@anthropic-ai/sdk";

export type PromptIntent =
  | "statistics"    // GDP, population, metrics → World Bank, Eurostat, PxWeb
  | "poi"           // restaurants in Stockholm → Overpass
  | "entity_search" // Paradise Hotel contestants, IKEA stores → Web Research
  | "general";      // anything else → full waterfall

interface ClassificationResult {
  intent: PromptIntent;
}

const CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `Classify the user's map prompt into exactly one intent. Reply with ONLY the intent word, nothing else.

Intents:
- statistics: Numeric country/region-level data (GDP, population, unemployment, emissions, life expectancy, rates, percentages, indices)
- poi: Finding specific types of places/amenities within a city or area (restaurants in Stockholm, parks in London, charging stations nearby)
- entity_search: Finding specific named things and their locations (TV show contestants, store locations across countries, tour dates, historical events, people)
- general: Anything else (historical maps, custom data, vague prompts)

Examples:
"GDP per capita in Europe" → statistics
"restaurants in Stockholm" → poi
"Paradise Hotel deltagare 2024" → entity_search
"IKEA stores in Europe" → entity_search
"Taylor Swift tour cities" → entity_search
"countries in the Roman Empire" → entity_search
"hotels in Paris" → poi
"population by country" → statistics
"unemployment in Sweden" → statistics
"visa en karta" → general
"earthquake activity Japan" → general
"coffee shops in Berlin" → poi
"Nobel prize winners by country" → entity_search
"var kommer deltagarna ifrån" → entity_search
"arbetslöshet per kommun" → statistics`;

export async function classifyIntent(
  prompt: string,
): Promise<ClassificationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { intent: "general" };

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: CLASSIFIER_MODEL,
      max_tokens: 10,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text.trim().toLowerCase())
      .join("");

    if (text.includes("statistics")) return { intent: "statistics" };
    if (text.includes("poi")) return { intent: "poi" };
    if (text.includes("entity_search")) return { intent: "entity_search" };
    return { intent: "general" };
  } catch (err) {
    console.error("[intent-classifier] classification failed:", err);
    return { intent: "general" };
  }
}
