-- Phase 3: Formalize RLS policies for the maps table.
-- The maps table was created in the Supabase dashboard. This migration
-- ensures RLS is enabled and policies are explicitly defined in code.
-- Run via Dashboard SQL Editor or supabase db push.

-- ─── Enable RLS (idempotent) ────────────────────────────────────────────────
ALTER TABLE public.maps ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to avoid conflicts, then recreate
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can CRUD own maps" ON public.maps;
  DROP POLICY IF EXISTS "Public maps readable by anyone" ON public.maps;
  DROP POLICY IF EXISTS "maps_owner_all" ON public.maps;
  DROP POLICY IF EXISTS "maps_public_select" ON public.maps;
END $$;

-- ─── Owner can do everything with their own maps ────────────────────────────
CREATE POLICY "maps_owner_all" ON public.maps
  FOR ALL USING ((SELECT auth.uid()) = user_id);

-- ─── Anyone can read public maps ────────────────────────────────────────────
CREATE POLICY "maps_public_select" ON public.maps
  FOR SELECT USING (is_public = true);
