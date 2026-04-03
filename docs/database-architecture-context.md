<!-- last-reviewed: 2026-04-03 -->
# Atlas Database Architecture — Context for Codex

> This document describes the current state of Atlas persistence as of 2026-04-01.
> It is intended as a briefing for AI agents that need to understand the database before making architectural decisions.
> **Read this fully before proposing schema changes.**

---

## The core problem

Atlas has **three separate persistence worlds** with different lifetimes, reliability, and discoverability:

| Layer | What lives here | Defined where | Survives deploy? | Survives cold start? |
|---|---|---|---|---|
| **Supabase Postgres** | maps, profiles, map_versions, data_cache, clarify_cache, clarify_resolutions | Partly in migrations, partly created manually in Dashboard/SQL Editor | Yes | Yes |
| **Manual SQL tables** | data_cache, clarify_cache, clarify_resolutions | NOT in migration chain — created via SQL Editor or standalone scripts | Yes | Yes |
| **Local filesystem** | resolution-memory, case-memory | `.next/cache/atlas-data/` and `.next/cache/atlas-cases/` | No (wiped on deploy) | No (wiped on cold start) |

This means learning and state is fragmented. Resolution-memory (which tables work for which prompts) and case-memory (full generation records) are lost on every deploy. The database contains some caching but the schema isn't tracked in migrations.

---

## Tables — complete inventory

### 1. `maps` (Supabase Postgres)

**Created:** Supabase Dashboard (manually). NOT in any migration file.
**RLS formalized in:** `supabase/migrations/003_maps_rls.sql`
**Columns added by migration:** `slug` (001), `chat_history` (004)

```sql
-- Schema (reconstructed from types.ts — no CREATE TABLE in repo)
maps (
  id            uuid primary key,
  user_id       uuid references auth.users(id),
  title         text,
  description   text,
  prompt        text not null,
  manifest      jsonb not null,
  geojson_url   text,
  thumbnail_url text,
  is_public     boolean default false,
  slug          text unique,          -- added by migration 001
  chat_history  jsonb default '[]',   -- added by migration 004
  created_at    timestamptz,
  updated_at    timestamptz
)
```

**RLS policies:**
- `maps_owner_all`: owner can do everything (`auth.uid() = user_id`)
- `maps_public_select`: anyone can read public maps (`is_public = true`)

**Indexes:** `idx_maps_slug`, `idx_maps_user_updated`

---

### 2. `profiles` (Supabase Postgres)

**Created:** `supabase/migrations/001_profiles_and_slugs.sql`

```sql
profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  plan         text not null default 'free' check (plan in ('free','pro','enterprise')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
)
```

**Trigger:** `on_auth_user_created` → auto-creates profile row from auth.users metadata.

**RLS:** select=public, update=own, insert=own.

---

### 3. `map_versions` (Supabase Postgres)

**Created:** `supabase/migrations/002_map_versions.sql`

```sql
map_versions (
  id         uuid primary key default gen_random_uuid(),
  map_id     uuid not null references maps(id) on delete cascade,
  version    int not null,
  prompt     text,
  manifest   jsonb not null,
  created_at timestamptz not null default now(),
  unique (map_id, version)
)
```

**Function:** `insert_map_version(p_map_id, p_manifest, p_prompt)` — atomic version insert (computes version number inside statement to prevent race conditions).

**RLS:** owner can select/insert via maps join. Versions are immutable (no update policy).

---

### 4. `data_cache` (Supabase Postgres)

**Created:** `apps/web/scripts/create-data-cache-table.sql` — **NOT in migration chain**. Run manually in SQL Editor.

```sql
data_cache (
  id                uuid default gen_random_uuid() primary key,
  cache_key         text not null unique,
  data              jsonb not null,        -- GeoJSON FeatureCollection
  profile           jsonb not null,        -- DatasetProfile
  source            text not null,
  description       text not null default '',
  resolution_status text,                  -- 'map_ready' | 'tabular_only' | null
  created_at        timestamptz default now(),
  expires_at        timestamptz            -- null = no expiry
)
```

**Purpose:** Caches fetched GeoJSON data so repeated prompts don't re-fetch from external APIs.
**RLS:** Enabled, no policies = service role only (server-side access).
**Indexes:** `data_cache_key_idx` (key lookup), `data_cache_expires_idx` (expired entry cleanup).

---

### 5. `clarify_cache` (Supabase Postgres)

**Created:** Manually in Supabase — **NO SQL definition in repo**.
**Schema known from:** `apps/web/lib/supabase/types.ts` (generated types)

```sql
-- Reconstructed from types.ts — no CREATE TABLE in repo
clarify_cache (
  id          uuid primary key,
  prompt_key  text not null,       -- normalized prompt as cache key
  response    jsonb not null,      -- full ClarifyResponse object
  ttl_hours   int,
  hit_count   int default 0,
  created_at  timestamptz,
  expires_at  timestamptz,
  last_hit_at timestamptz
)
```

**Purpose:** Caches the AI clarification step result. When a user types a prompt similar to a previous one, the cached clarify response is returned instantly instead of re-running the AI pipeline. TTL varies by data freshness (1h for real-time feeds, 24h for static data).

**Used by:** `apps/web/lib/ai/clarify-cache.ts`

**Known issue:** `increment_clarify_hit` function is declared in types.ts but was reported missing from live database schema cache. This is a concrete mismatch between types and reality.

---

### 6. `clarify_resolutions` (Supabase Postgres)

**Created:** Manually in Supabase — **NO SQL definition in repo**.
**Schema known from:** `apps/web/lib/supabase/types.ts`

```sql
-- Reconstructed from types.ts — no CREATE TABLE in repo
clarify_resolutions (
  id               uuid primary key,
  prompt_original  text not null,
  prompt_key       text not null,       -- normalized key
  resolved_prompt  text not null,       -- what the clarify step produced
  data_url         text not null,       -- URL to the resolved data
  source_type      text not null,       -- e.g. "pxweb", "eurostat"
  keywords         text[] not null,     -- extracted topic keywords for similarity search
  use_count        int default 0,
  created_at       timestamptz,
  last_used_at     timestamptz
)
```

**Purpose:** Stores successful prompt → data-source resolutions. When a new prompt has similar keywords, proven resolutions are used as few-shot examples to improve future clarify accuracy.

**Used by:** `apps/web/lib/ai/clarify-resolution-store.ts`

---

### 7. `resolution-memory` (LOCAL FILESYSTEM)

**Location:** `.next/cache/atlas-data/resolution-memory.json`
**Defined in:** `apps/web/lib/ai/tools/resolution-memory.ts`

```typescript
interface ResolutionRecord {
  sourceId: string;        // "pxweb-se-scb"
  countryCode: string;     // "SE"
  tableId: string;         // PxWeb table that produced map_ready
  tableLabel: string;
  geoLevel: string;
  keywords: string[];      // topic keywords from prompt
  coverageRatio: number;   // 0-1 join coverage
  successCount: number;
  lastUsed: number;        // timestamp
}
```

**Purpose:** After a successful PxWeb resolution (map_ready), stores the "recipe" so future prompts with similar topics get the proven table prepended to the candidate list.

**Critical limitation:** Stored as a JSON file in `.next/cache/`. Lost on every deploy and every serverless cold start. The system forgets what it learned each time it restarts.

---

### 8. `case-memory` (LOCAL FILESYSTEM)

**Location:** `.next/cache/atlas-cases/{id}.json`
**Defined in:** `apps/web/lib/ai/case-memory.ts`

```typescript
interface CaseRecord {
  id: string;
  prompt: string;
  clarifications: unknown;
  dataSource: unknown;
  manifest: unknown;
  qualityScore: number;
  outcome: unknown;
  refinements: RefinementEvent[];  // max 20
}
```

**Purpose:** Saves full map generation records (prompt → data → manifest → quality → outcome) for future learning/retrieval. Individual JSON files per case.

**Critical limitation:** Same as resolution-memory — lost on deploy. No TTL, files accumulate indefinitely until deploy wipes them.

---

## Database functions

| Function | Defined in | Status |
|---|---|---|
| `handle_new_user()` | migration 001 | Working — trigger on auth.users insert |
| `insert_map_version(p_map_id, p_manifest, p_prompt)` | migration 002 | Working — atomic version insert |
| `increment_clarify_hit(p_prompt_key)` | types.ts only | **MISMATCH** — declared in types but reportedly missing from live DB |

---

## Migrations

```
supabase/migrations/
  001_profiles_and_slugs.sql     — profiles table + slug column on maps
  002_map_versions.sql           — map_versions table + insert_map_version()
  003_maps_rls.sql               — RLS policies for maps (table already existed)
  004_chat_history.sql           — chat_history column on maps
```

**What is NOT in migrations:**
- `maps` table creation (done in Dashboard)
- `data_cache` table (standalone script in `apps/web/scripts/`)
- `clarify_cache` table (no SQL anywhere in repo)
- `clarify_resolutions` table (no SQL anywhere in repo)
- `increment_clarify_hit` function (no SQL anywhere in repo)

---

## How data flows through these layers

```
User prompt
  → clarify-cache.ts checks clarify_cache (Supabase)
    → HIT: return cached ClarifyResponse
    → MISS: run AI clarify pipeline
      → on success: write to clarify_cache + clarify_resolutions (Supabase)
  
  → Data fetching (PxWeb, Eurostat, etc.)
    → resolution-memory.ts checks resolution-memory.json (LOCAL FILE)
      → HIT: prepend proven table to candidates
      → MISS: try all candidates
    → Fetched GeoJSON written to data_cache (Supabase)
  
  → AI generates MapManifest
    → case-memory.ts saves full CaseRecord (LOCAL FILE)
  
  → Map saved to maps table (Supabase)
    → map_versions records each refinement (Supabase)
```

---

## Durable Dataset Layer (added post-2026-04-01)

Three migrations were added after this document was originally written:

**Migration 010 (`dataset_artifacts`):** Permanent, versioned record of every dataset fetched and joined.
- Columns: source_id, table_id, query_fingerprint, version, profile, normalized_meta, provenance, status, feature_count, content_hash
- Write path: `saveArtifact()` in `artifact.ts` — fire-and-forget for PxWeb map_ready results

**Migration 013 (`data_cache_pinned_and_meta`):** Adds `pinned` boolean and `normalized_meta` JSONB to data_cache.
- Pinned entries survive TTL cleanup — used when saved maps reference a cache entry.

**Migration 014 (`durable_dataset_storage`):** Extends both `dataset_artifacts` and `maps`:
- `dataset_artifacts` gets: storage_bucket, storage_path, owner_user_id, is_public
- `maps` gets: `artifact_id` (FK to dataset_artifacts), `data_status` ("ok" | "missing_source" | "legacy")
- Creates `datasets` storage bucket (private, served via API)

**Current state:** Migrations applied, write paths active, read paths partially implemented. Maps can reference artifacts but still fall back to cache URLs.

---

## Known inconsistencies

1. **clarify_cache and clarify_resolutions have no schema definition in repo.** Their structure is only known from generated types.ts. No CREATE TABLE, no indexes, no RLS policies documented.

2. **increment_clarify_hit is declared in types.ts but missing from live DB.** The function is called in clarify-cache.ts. If it doesn't exist, hits aren't being counted — degrading cache effectiveness metrics silently.

3. **resolution-memory and case-memory are ephemeral.** They use `.next/cache/` which is wiped on deploy. This means the system never persistently learns which PxWeb tables work for which topics, or what the full generation history looks like.

4. **data_cache has no migration.** Created via a standalone script. If the database is recreated from migrations, data_cache won't exist.

5. **maps table has no CREATE TABLE statement anywhere.** Its schema is only known from types.ts and the columns added by later migrations.

---

## Implications for new features (e.g., data upload)

Any new persistence (uploaded files, user datasets, upload profiles) should:

1. **Be defined in a migration file** — not created manually in Dashboard
2. **Have RLS policies from day one** — especially if user data is involved
3. **Not use `.next/cache/`** — it's ephemeral and unsurvivable
4. **Be reflected in types.ts** — regenerate types after migration
5. **Have the actual Supabase schema match types.ts** — verify after applying migrations

The three-world problem should be consolidated before adding a fourth persistence mechanism.
