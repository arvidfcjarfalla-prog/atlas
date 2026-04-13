/**
 * Lightweight intent classifier.
 *
 * Uses Haiku to quickly classify a user prompt into a routing intent
 * so the clarify waterfall can skip irrelevant fast paths.
 *
 * Cost: ~$0.001 per call. Latency: ~200-400ms.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

export type PromptIntent =
  | "statistics"    // GDP, population, metrics → World Bank, Eurostat, PxWeb
  | "poi"           // restaurants in Stockholm → Overpass
  | "entity_search" // Paradise Hotel contestants, IKEA stores → Web Research
  | "general";      // anything else → full waterfall

interface ClassificationResult {
  intent: PromptIntent;
}

// Pinned to Haiku; the prompt is tuned for it. Don't swap via MODELS.utility()
// (utility can route to Gemini via AI_UTILITY_MODEL env).
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
  if (!process.env.ANTHROPIC_API_KEY) return { intent: "general" };

  try {
    const { text } = await generateText({
      model: anthropic(CLASSIFIER_MODEL),
      maxOutputTokens: 10,
      system: SYSTEM_PROMPT,
      prompt,
    });

    const normalized = text.trim().toLowerCase();
    if (normalized.includes("statistics")) return { intent: "statistics" };
    if (normalized.includes("poi")) return { intent: "poi" };
    if (normalized.includes("entity_search")) return { intent: "entity_search" };
    return { intent: "general" };
  } catch (err) {
    console.error("[intent-classifier] classification failed:", err);
    return { intent: "general" };
  }
}
