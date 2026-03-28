import { NextResponse } from "next/server";
import { generateText } from "ai";
import { MODELS } from "../../../../lib/ai/ai-client";

const MAX_TOKENS = 128;

const SYSTEM_PROMPT = `You rewrite map prompts so Atlas (an AI map platform) understands them perfectly.

Atlas needs:
- A clear METRIC (population, GDP, crime rate, temperature, etc.)
- A specific GEOGRAPHY (country name, e.g. "Germany", "Brazil")
- A LEVEL (by country, by state/region, by city)
- Optional: timeframe, comparison, visualization hint

Rules:
1. Always output in English (translate Swedish, Spanish, etc.)
2. Keep it under 15 words
3. Be concrete — "map of stuff" → "Population density by country in Europe"
4. Preserve the user's intent — don't change the topic
5. If the prompt is already specific enough, return it as-is (in English)
6. Output ONLY the rewritten prompt, nothing else — no quotes, no explanation`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

    if (!prompt) {
      return NextResponse.json({ error: "No prompt provided" }, { status: 400 });
    }

    const { text } = await generateText({
      model: MODELS.utility(),
      maxOutputTokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const enhanced = text.trim() || prompt;

    return NextResponse.json({ enhanced });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Enhancement failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
