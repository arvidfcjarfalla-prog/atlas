-- Blueprint v3.1 §4: Dataset Artifacts
-- Permanent, versioned record of every dataset the platform has fetched and joined.
-- Additive: does not replace data_cache. Maps continue reading from data_cache.

CREATE TABLE IF NOT EXISTS public.dataset_artifacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         TEXT NOT NULL,
  table_id          TEXT,
  query_fingerprint TEXT NOT NULL,
  version           INT NOT NULL DEFAULT 1,
  geojson_url       TEXT NOT NULL,
  profile           JSONB NOT NULL,
  normalized_meta   JSONB,
  provenance        JSONB NOT NULL,
  status            TEXT NOT NULL DEFAULT 'map_ready'
                      CHECK (status IN ('map_ready', 'tabular_only')),
  feature_count     INT NOT NULL,
  content_hash      TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, query_fingerprint, version)
);

CREATE INDEX IF NOT EXISTS idx_artifact_fingerprint
  ON public.dataset_artifacts (source_id, query_fingerprint, version DESC);

CREATE INDEX IF NOT EXISTS idx_artifact_source
  ON public.dataset_artifacts (source_id, table_id);

ALTER TABLE public.dataset_artifacts ENABLE ROW LEVEL SECURITY;

-- Grant API roles access (required for PostgREST / Supabase JS client)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dataset_artifacts TO anon, authenticated, service_role;
