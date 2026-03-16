import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";
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

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );

    const enhanced = textBlock?.text.trim() ?? prompt;

    return NextResponse.json({ enhanced });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Enhancement failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
