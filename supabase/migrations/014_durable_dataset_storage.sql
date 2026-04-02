-- Fas 1: Durable dataset storage.
-- dataset_artifacts becomes canonical durable dataset layer.
-- maps references artifact by ID instead of cache URL.

-- ─── Extend dataset_artifacts ──────────────────────────────────────────────

ALTER TABLE public.dataset_artifacts
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS storage_path   TEXT,
  ADD COLUMN IF NOT EXISTS owner_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_public      BOOLEAN NOT NULL DEFAULT true;

-- Allow geojson_url to be null for storage-backed artifacts (no longer cache-coupled)
ALTER TABLE public.dataset_artifacts ALTER COLUMN geojson_url DROP NOT NULL;

-- Index for content-hash dedup lookups
CREATE INDEX IF NOT EXISTS idx_artifact_content_hash
  ON public.dataset_artifacts (content_hash);

-- ─── Extend maps ───────────────────────────────────────────────────────────

ALTER TABLE public.maps
  ADD COLUMN IF NOT EXISTS artifact_id UUID REFERENCES public.dataset_artifacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS data_status TEXT NOT NULL DEFAULT 'legacy'
    CHECK (data_status IN ('ok', 'missing_source', 'legacy'));

CREATE INDEX IF NOT EXISTS idx_maps_artifact
  ON public.maps (artifact_id)
  WHERE artifact_id IS NOT NULL;

-- ─── Storage bucket ────────────────────────────────────────────────────────
-- Private bucket — served through /api/datasets/[id]/geojson, not direct URLs.

INSERT INTO storage.buckets (id, name, public)
VALUES ('datasets', 'datasets', false)
ON CONFLICT (id) DO NOTHING;
