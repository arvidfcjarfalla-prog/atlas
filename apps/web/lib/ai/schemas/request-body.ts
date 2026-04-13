import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ALLOWED_REGIONS = [
  "Europe",
  "Africa",
  "Asia",
  "South America",
  "North America",
  "Oceania",
] as const;

export const ALLOWED_FILTER_FIELDS = ["continent", "region", "subregion"] as const;

const ManifestShape = z.record(z.string(), z.unknown());
const ProfileShape = z.record(z.string(), z.unknown());

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export const ChatRequestSchema = z.object({
  manifest: ManifestShape,
  message: z.string().min(1, "message must not be empty"),
  chatHistory: z.array(ChatMessageSchema).optional().default([]),
  dataProfile: ProfileShape.optional(),
});

export type ChatRequestBody = z.infer<typeof ChatRequestSchema>;

const ScopeHintSchema = z.object({
  region: z.enum(ALLOWED_REGIONS),
  filterField: z.enum(ALLOWED_FILTER_FIELDS),
});

export const GenerateMapRequestSchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(1, "prompt must not be empty")
      .max(2000, "prompt exceeds 2000 character limit"),
    dataUrl: z.string().optional(),
    sourceUrl: z.string().optional(),
    dataProfile: ProfileShape.optional(),
    artifactId: z.string().regex(UUID_RE, "artifactId must be a UUID").optional(),
    // Silently drop invalid scopeHint shapes rather than 400ing the whole
    // request — matches the pre-zod forgiving behavior that callers rely on.
    scopeHint: ScopeHintSchema.optional().catch(undefined),
    preferences: z.record(z.string(), z.string()).optional(),
  })
  .strip();

export type GenerateMapRequestBody = z.infer<typeof GenerateMapRequestSchema>;

export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}
