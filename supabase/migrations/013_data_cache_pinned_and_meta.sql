-- Add pinned flag and normalized_meta to data_cache.
-- Pinned entries survive TTL expiry — used when a saved map references a cache entry.

ALTER TABLE public.data_cache ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.data_cache ADD COLUMN IF NOT EXISTS normalized_meta JSONB;

-- Partial index: cron cleanup queries unpinned entries by created_at.
CREATE INDEX IF NOT EXISTS data_cache_unpinned_created_idx
  ON public.data_cache (created_at)
  WHERE pinned = false;

-- Backfill: pin cache entries already referenced by saved maps.
-- geojson_url is '/api/geo/cached/{encoded_key}' — match both raw and encoded forms.
UPDATE public.data_cache dc
SET pinned = true
WHERE EXISTS (
  SELECT 1 FROM public.maps m
  WHERE m.geojson_url IS NOT NULL
    AND (m.geojson_url = '/api/geo/cached/' || dc.cache_key
      OR m.geojson_url = '/api/geo/cached/' || replace(replace(replace(
           dc.cache_key, '%', '%25'), '/', '%2F'), ' ', '%20'))
);
