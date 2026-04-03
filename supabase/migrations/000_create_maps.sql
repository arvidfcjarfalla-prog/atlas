-- Formalize the maps table that was originally created in the Supabase dashboard.
-- Idempotent: IF NOT EXISTS so this is a noop in environments where maps already exists.
-- Must run before 001_profiles_and_slugs.sql which adds columns and indexes to maps.

CREATE TABLE IF NOT EXISTS public.maps (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL DEFAULT '',
  description    TEXT,
  prompt         TEXT NOT NULL DEFAULT '',
  manifest       JSONB NOT NULL DEFAULT '{}'::jsonb,
  geojson_url    TEXT,
  thumbnail_url  TEXT,
  is_public      BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.maps ENABLE ROW LEVEL SECURITY;

-- Auto-update updated_at on row modification.
-- The app sorts maps by updated_at but never sets it explicitly in UPDATE calls.
CREATE OR REPLACE FUNCTION public.set_maps_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- DROP first so the migration is re-runnable even if the trigger already exists.
DROP TRIGGER IF EXISTS trg_maps_updated_at ON public.maps;
CREATE TRIGGER trg_maps_updated_at
  BEFORE UPDATE ON public.maps
  FOR EACH ROW EXECUTE FUNCTION public.set_maps_updated_at();
