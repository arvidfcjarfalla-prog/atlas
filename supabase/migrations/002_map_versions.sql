-- Phase 3: map_versions table for refinement history
-- Run against your Supabase project via Dashboard SQL Editor or supabase db push.

-- ─── Map versions ───────────────────────────────────────────────────────────
CREATE TABLE public.map_versions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id     UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  version    INT NOT NULL,
  prompt     TEXT,              -- the refinement prompt that produced this version
  manifest   JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (map_id, version)
);

CREATE INDEX idx_map_versions_map_id ON public.map_versions(map_id, version DESC);

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.map_versions ENABLE ROW LEVEL SECURITY;

-- Owner can read versions of their own maps
CREATE POLICY "map_versions_select" ON public.map_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.maps
      WHERE maps.id = map_versions.map_id
        AND maps.user_id = (SELECT auth.uid())
    )
  );

-- Owner can insert versions for their own maps
CREATE POLICY "map_versions_insert" ON public.map_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.maps
      WHERE maps.id = map_versions.map_id
        AND maps.user_id = (SELECT auth.uid())
    )
  );

-- No update policy: versions are immutable
-- Deletion handled by ON DELETE CASCADE from maps table

-- ─── Atomic version insert function ────────────────────────────────────────
-- Prevents race conditions by computing version number inside a single statement.
CREATE OR REPLACE FUNCTION public.insert_map_version(
  p_map_id UUID,
  p_manifest JSONB,
  p_prompt TEXT DEFAULT NULL
)
RETURNS TABLE(id UUID, version INT, created_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY INVOKER
AS $$
  INSERT INTO public.map_versions (map_id, version, manifest, prompt)
  VALUES (
    p_map_id,
    COALESCE((SELECT MAX(v.version) FROM public.map_versions v WHERE v.map_id = p_map_id), 0) + 1,
    p_manifest,
    p_prompt
  )
  RETURNING map_versions.id, map_versions.version, map_versions.created_at;
$$;
