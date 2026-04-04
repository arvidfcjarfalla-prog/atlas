import { getServiceClient } from "../supabase/service";

export interface ResolutionExample {
  promptOriginal: string;
  resolvedPrompt: string;
  dataUrl: string;
  sourceType: string;
}

// Common stop words (Swedish + English) to filter from keyword extraction
const STOP_WORDS = new Set([
  "och", "eller", "för", "från", "till", "med", "utan", "under", "över",
  "per", "som", "att", "är", "var", "har", "inte", "alla", "efter",
  "the", "and", "for", "from", "with", "that", "this", "have", "been",
  "show", "map", "data", "karta", "visa",
]);

/** Extract topic keywords from a prompt for similarity matching. */
export function extractKeywords(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Store a successful resolution for future few-shot retrieval. */
export async function storeResolution(
  promptOriginal: string,
  promptKey: string,
  resolvedPrompt: string,
  dataUrl: string,
  sourceType: string,
): Promise<void> {
  if (process.env.ATLAS_ENABLE_CLARIFY_CACHE !== "true") return;
  const client = getServiceClient();
  if (!client) return;
  const keywords = extractKeywords(promptOriginal);
  if (keywords.length === 0) return;
  try {
    const { data: existing } = await client
      .from("clarify_resolutions")
      .select("id, use_count")
      .eq("prompt_key", promptKey)
      .maybeSingle();

    if (existing) {
      await client
        .from("clarify_resolutions")
        .update({ use_count: existing.use_count + 1, last_used_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await client.from("clarify_resolutions").insert({
        prompt_original: promptOriginal,
        prompt_key: promptKey,
        resolved_prompt: resolvedPrompt,
        data_url: dataUrl,
        source_type: sourceType,
        keywords,
      });
    }
  } catch {
    // Non-critical
  }
}

/** Find similar past resolutions for few-shot injection into the clarify prompt. */
export async function findSimilarResolutions(
  prompt: string,
  limit = 3,
): Promise<ResolutionExample[]> {
  if (process.env.ATLAS_ENABLE_CLARIFY_CACHE !== "true") return [];
  const client = getServiceClient();
  if (!client) return [];
  const keywords = extractKeywords(prompt);
  if (keywords.length === 0) return [];
  try {
    const { data, error } = await client
      .from("clarify_resolutions")
      .select("prompt_original, resolved_prompt, data_url, source_type, keywords, use_count")
      .overlaps("keywords", keywords)
      .order("use_count", { ascending: false })
      .limit(20);

    if (error || !data || data.length === 0) return [];

    const inputSet = new Set(keywords);
    return data
      .map((row) => ({
        row,
        overlap: (row.keywords as string[]).filter((k) => inputSet.has(k)).length,
      }))
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, limit)
      .map(({ row }) => ({
        promptOriginal: row.prompt_original,
        resolvedPrompt: row.resolved_prompt,
        dataUrl: row.data_url,
        sourceType: row.source_type,
      }));
  } catch {
    return [];
  }
}
