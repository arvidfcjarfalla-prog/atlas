-- Phase 1: profiles table + slug column on maps
-- Run against your Supabase project via Dashboard SQL Editor or supabase db push.

-- ─── Profiles ────────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url   TEXT,
  plan         TEXT NOT NULL DEFAULT 'free'
                 CHECK (plan IN ('free', 'pro', 'enterprise')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read profiles (for shared map author display)
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (true);

-- Users can only update their own profile
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Users can insert their own profile (edge case: manual creation)
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create a profile row whenever a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    new.id,
    COALESCE(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Slug column on maps ─────────────────────────────────────────────────────
ALTER TABLE public.maps ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

CREATE INDEX idx_maps_slug ON public.maps(slug) WHERE slug IS NOT NULL;
CREATE INDEX idx_maps_user_updated ON public.maps(user_id, updated_at DESC);
