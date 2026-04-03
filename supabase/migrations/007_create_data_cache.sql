-- Formalize the data_cache table previously created via scripts/create-data-cache-table.sql.
-- Idempotent: IF NOT EXISTS throughout.
-- Server-side only (RLS enabled, no policies = service role access only).

CREATE TABLE IF NOT EXISTS public.data_cache (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key         TEXT NOT NULL UNIQUE,
  data              JSONB NOT NULL,
  profile           JSONB NOT NULL,
  source            TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  resolution_status TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  expires_at        TIMESTAMPTZ
);

-- cache_key already has a unique index from the UNIQUE constraint.

CREATE INDEX IF NOT EXISTS data_cache_expires_idx
  ON public.data_cache (expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE public.data_cache ENABLE ROW LEVEL SECURITY;
