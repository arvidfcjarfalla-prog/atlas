-- Create the data_cache table for durable GeoJSON caching.
-- Run this in the Supabase SQL editor before deploying.
--
-- This replaces the file-based cache in .next/cache/atlas-data/
-- which does not survive serverless cold starts.

create table if not exists public.data_cache (
  id uuid default gen_random_uuid() primary key,
  cache_key text not null unique,
  data jsonb not null,           -- GeoJSON FeatureCollection
  profile jsonb not null,        -- DatasetProfile
  source text not null,
  description text not null default '',
  resolution_status text,        -- 'map_ready' | 'tabular_only' | null
  created_at timestamptz default now(),
  expires_at timestamptz         -- null = no expiry
);

-- Index for key lookup (primary access pattern)
create index if not exists data_cache_key_idx on public.data_cache (cache_key);

-- Index for cleanup of expired entries
create index if not exists data_cache_expires_idx on public.data_cache (expires_at)
  where expires_at is not null;

-- RLS: only service role can read/write (no browser access)
alter table public.data_cache enable row level security;

-- No RLS policies = only service role key can access.
-- This is intentional — data cache is server-side only.
