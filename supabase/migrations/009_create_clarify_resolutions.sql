-- Formalize the clarify_resolutions table created in the Supabase dashboard.
-- Used by clarify-resolution-store.ts for few-shot example retrieval.
-- Idempotent: IF NOT EXISTS throughout.
-- Server-side only (RLS enabled, no policies = service role access only).

CREATE TABLE IF NOT EXISTS public.clarify_resolutions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_original  TEXT NOT NULL,
  prompt_key       TEXT NOT NULL UNIQUE,
  resolved_prompt  TEXT NOT NULL,
  data_url         TEXT NOT NULL,
  source_type      TEXT NOT NULL,
  keywords         TEXT[] NOT NULL DEFAULT '{}',
  use_count        INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GIN index for .overlaps() queries on keywords array.
CREATE INDEX IF NOT EXISTS clarify_resolutions_keywords_idx
  ON public.clarify_resolutions USING GIN (keywords);

-- prompt_key already has a unique index from the UNIQUE constraint.

ALTER TABLE public.clarify_resolutions ENABLE ROW LEVEL SECURITY;
