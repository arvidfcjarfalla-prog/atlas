import { describe, expect, it } from "vitest";
import {
  ChatRequestSchema,
  GenerateMapRequestSchema,
  formatZodIssues,
} from "../request-body";

describe("ChatRequestSchema", () => {
  const validBody = {
    manifest: { version: "1", layers: [] },
    message: "make it blue",
  };

  it("accepts minimal valid body", () => {
    const parsed = ChatRequestSchema.safeParse(validBody);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.chatHistory).toEqual([]);
  });

  it("accepts body with chatHistory + dataProfile", () => {
    const parsed = ChatRequestSchema.safeParse({
      ...validBody,
      chatHistory: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }],
      dataProfile: { featureCount: 10 },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects missing manifest", () => {
    const parsed = ChatRequestSchema.safeParse({ message: "x" });
    expect(parsed.success).toBe(false);
  });

  it("rejects missing message", () => {
    const parsed = ChatRequestSchema.safeParse({ manifest: {} });
    expect(parsed.success).toBe(false);
  });

  it("rejects empty message string", () => {
    const parsed = ChatRequestSchema.safeParse({ ...validBody, message: "" });
    expect(parsed.success).toBe(false);
  });

  it("rejects chatHistory with bad role", () => {
    const parsed = ChatRequestSchema.safeParse({
      ...validBody,
      chatHistory: [{ role: "system", content: "bad" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects null body", () => {
    const parsed = ChatRequestSchema.safeParse(null);
    expect(parsed.success).toBe(false);
  });

  it("rejects non-object body", () => {
    expect(ChatRequestSchema.safeParse("hi").success).toBe(false);
    expect(ChatRequestSchema.safeParse(42).success).toBe(false);
  });
});

describe("GenerateMapRequestSchema", () => {
  const UUID = "11111111-2222-3333-4444-555555555555";

  it("accepts minimal valid body", () => {
    const parsed = GenerateMapRequestSchema.safeParse({ prompt: "map the world" });
    expect(parsed.success).toBe(true);
  });

  it("trims prompt whitespace", () => {
    const parsed = GenerateMapRequestSchema.safeParse({ prompt: "  hello  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.prompt).toBe("hello");
  });

  it("rejects empty/whitespace-only prompt", () => {
    expect(GenerateMapRequestSchema.safeParse({ prompt: "" }).success).toBe(false);
    expect(GenerateMapRequestSchema.safeParse({ prompt: "   " }).success).toBe(false);
  });

  it("rejects prompt > 2000 chars", () => {
    const parsed = GenerateMapRequestSchema.safeParse({ prompt: "a".repeat(2001) });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(formatZodIssues(parsed.error)).toMatch(/2000/);
    }
  });

  it("accepts prompt = 2000 chars exactly", () => {
    const parsed = GenerateMapRequestSchema.safeParse({ prompt: "a".repeat(2000) });
    expect(parsed.success).toBe(true);
  });

  it("accepts valid UUID artifactId", () => {
    const parsed = GenerateMapRequestSchema.safeParse({ prompt: "x", artifactId: UUID });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.artifactId).toBe(UUID);
  });

  it("rejects non-UUID artifactId", () => {
    const parsed = GenerateMapRequestSchema.safeParse({ prompt: "x", artifactId: "not-a-uuid" });
    expect(parsed.success).toBe(false);
  });

  it("silently drops invalid scopeHint.region (back-compat)", () => {
    const parsed = GenerateMapRequestSchema.safeParse({
      prompt: "x",
      scopeHint: { region: "Antarctica", filterField: "continent" },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.scopeHint).toBeUndefined();
  });

  it("silently drops invalid scopeHint.filterField (back-compat)", () => {
    const parsed = GenerateMapRequestSchema.safeParse({
      prompt: "x",
      scopeHint: { region: "Europe", filterField: "nope" },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.scopeHint).toBeUndefined();
  });

  it("accepts valid scopeHint", () => {
    const parsed = GenerateMapRequestSchema.safeParse({
      prompt: "x",
      scopeHint: { region: "Europe", filterField: "continent" },
    });
    expect(parsed.success).toBe(true);
  });

  it("strips unknown top-level fields", () => {
    const parsed = GenerateMapRequestSchema.safeParse({
      prompt: "x",
      evilInject: "<script>",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect((parsed.data as Record<string, unknown>).evilInject).toBeUndefined();
  });

  it("accepts preferences as string-string record", () => {
    const parsed = GenerateMapRequestSchema.safeParse({
      prompt: "x",
      preferences: { colorScheme: "diverging", classes: "5" },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects preferences with non-string value", () => {
    const parsed = GenerateMapRequestSchema.safeParse({
      prompt: "x",
      preferences: { classes: 5 },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("formatZodIssues", () => {
  it("formats path + message", () => {
    const result = GenerateMapRequestSchema.safeParse({ prompt: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const out = formatZodIssues(result.error);
      expect(out).toMatch(/prompt/);
    }
  });

  it("joins multiple issues with semicolons", () => {
    const result = GenerateMapRequestSchema.safeParse({ prompt: "", artifactId: "bad" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const out = formatZodIssues(result.error);
      expect(out).toContain(";");
    }
  });
});
