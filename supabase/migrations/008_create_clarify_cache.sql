-- Formalize the clarify_cache table and increment_clarify_hit function.
-- Both were created in the Supabase dashboard with no SQL in the repo.
-- Idempotent: IF NOT EXISTS for table/index, CREATE OR REPLACE for function.
-- Server-side only (RLS enabled, no policies = service role access only).

CREATE TABLE IF NOT EXISTS public.clarify_cache (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key  TEXT NOT NULL UNIQUE,
  response    JSONB NOT NULL,
  ttl_hours   INTEGER NOT NULL DEFAULT 24,
  hit_count   INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  last_hit_at TIMESTAMPTZ
);

-- prompt_key already has a unique index from the UNIQUE constraint.

CREATE INDEX IF NOT EXISTS clarify_cache_expires_idx
  ON public.clarify_cache (expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE public.clarify_cache ENABLE ROW LEVEL SECURITY;

-- Function called by clarify-cache.ts to atomically increment hit counter.
-- Reconstructed from types.ts signature and usage context.
CREATE OR REPLACE FUNCTION public.increment_clarify_hit(p_prompt_key TEXT)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE public.clarify_cache
  SET hit_count = hit_count + 1,
      last_hit_at = now()
  WHERE prompt_key = p_prompt_key;
$$;
