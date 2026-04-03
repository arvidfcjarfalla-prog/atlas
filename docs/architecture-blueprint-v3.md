<!-- last-reviewed: 2026-04-03 -->
# Atlas Architecture Blueprint v3.2

> v3 base: immutable logs, append-only events, derived aggregates, versioned artifacts.
> v3.1 precision pass: aggregation granularity, stable map→session link, artifact version
> policy, telemetry epistemics, migration dependency order.
> v3.2 reconciliation: migration numbering aligned with repo, phase status markers added,
> classifyTopicGroup reference corrected, tech-debt list updated.
>
> Design principles:
> - Narrower but true. No object tries to be two things.
> - Immutable logs, append-only events, derived aggregates. No mutable JSONB merges.
> - Attempt-based learning is PxWeb-only in v1. Other sources get session-level signals.
> - First-followup is best-effort telemetry, not a ranking signal, until validated.
> - Every table has one job.

---

## 1. Current System Model

### End-to-end flow

```
User prompt
  → POST /api/ai/clarify
    → clarify_cache check (Supabase Postgres)
    → waterfall of resolution paths:
        0. historical basemap
        1. catalog match
        1.5. Overpass POI
        2. PxWeb (official stats) ← multi-table attempt loop (up to 5 tables)
        2.5. Data Commons
        3. Eurostat
        3.5. World Bank / EONET / REST Countries
        3.5b. Dataset registry
        4. Agency hint (no adapter)
        4.5. Web research
        5. AI tool loop (Sonnet with tools)
    → data fetch + geometry join → data_cache (Supabase Postgres)
    → resolution-memory write (.next/cache — ephemeral)
    → clarify_cache + clarify_resolutions write (Supabase Postgres)
    → returns ClarifyResponse {dataUrl, dataProfile, resolvedPrompt}

  → POST /api/ai/generate-map
    → deterministic fast path (polygon + _atlas_value) OR
    → Claude Sonnet loop (max 3 + optional Opus fallback)
    → case-memory write (.next/cache — ephemeral)
    → returns {manifest, quality, caseId}

  → POST /api/maps (save)
  → redirect to /app/map/{id}

Editor path:
  → POST /api/ai/chat (SSE)
    → tools: search_data ← DUPLICATES resolution pipeline
    → tool: update_manifest → validate → score → emit manifest-update
  → PATCH /api/maps/{id} (autosave)
```

### The PxWeb attempt sequence

Inside `resolvePxWeb()`, resolution is a loop over ranked candidate tables:

```
1. Build search query from prompt
2. Search tables (translated + geo-enriched + English fallback)
3. Rank tables (geo-level boost, keyword match)
4. Prepend plugin-known tables + learned tables
5. Optional: Haiku AI picks best table from top 25
6. For i = 0 to min(5, tables.length):
     resolveOneTable(tables[i]):
       a. fetchMetadata → check for geo dimension
       b. selectDimensionsWithAmbiguity → optional AI contents pick
       c. fetchData → parse JSON-stat2 records
       d. normalize → detect geography → plan join → load geometry → execute join
       e. classify: map_ready | tabular_only | unsupported
     if map_ready → return
     if tabular_only → stash as fallback
7. Return best tabular fallback or unsupported
```

Each iteration can fail for a distinct reason: no_geo, no_data, join_failed, wrong_level, tabular_only, unsupported.

**This multi-table attempt loop only exists for PxWeb sources.** Eurostat, World Bank, Data Commons, and Overpass each return a single result — there is no retry loop over candidate tables.

### Where the model leaks

1. **Resolution attempts are invisible.** Only the winning table is remembered (in ephemeral `.next/cache`). Failed attempts carry learnable signal that is discarded.
2. **Two resolution codepaths.** `clarify/route.ts` and `chat/route.ts` both implement data resolution with different orchestration.
3. **Data has no stable identity.** `data_cache` is TTL-based. Saved maps reference cache entries that expire → 404s.
4. **Learning is ephemeral.** `resolution-memory` and `case-memory` use `.next/cache/` — wiped on every deploy.
5. **No negative feedback.** Outcome is always "accepted." The system cannot learn from failures.
6. **Semantic mismatch is undetectable.** "Projected Births 2070" scored 100/100 for "befolkning per kommun."

### Technical debt vs reasonable complexity

**Debt (remaining):** `.next/cache` learning stores (resolution-memory, case-memory, dataset-registry still active), `data_cache` conflated with artifact storage, two resolution codepaths (clarify + chat).

**Debt (resolved):** Tables without migrations — formalized via 000 (maps), 007 (data_cache), 008 (clarify_cache, includes increment_clarify_hit), 009 (clarify_resolutions). Dead searchPxWeb() code removed. Language mapping unified to shared constant. Canary table aligned with plugin known tables. Coverage thresholds extracted to shared `MIN_COVERAGE_RATIO`.

**Reasonable:** clarify/generate-map split, deterministic fast path, per-country geography plugins, manifest compiler abstraction, quality scorer.

---

## 2. Core Problems

1. **Resolution attempts are invisible.** The PxWeb loop tries 1–5 tables but only the winner is remembered. Failed attempts carry signal that is discarded.
2. **Two resolution codepaths.** `clarify` and `chat` implement data resolution independently. Bugs fixed in one don't propagate.
3. **Data has no stable identity.** Saved maps reference `data_cache` entries that expire. No versioning when upstream data changes.
4. **Learning is ephemeral.** `.next/cache` stores are wiped on deploy.
5. **No negative feedback loop.** Outcome is always "accepted."
6. **No object separation between request logs and feedback aggregates.** The system conflates "what happened in this request" with "what should we do next time."

---

## 3. Target Domain Model

### Design choice: three persistence tiers

Every object in the system has exactly one of three roles:

| Tier | Role | Mutability | Examples |
|---|---|---|---|
| **Immutable logs** | Record what happened | Write-once, never updated | `resolution_sessions`, `resolution_attempts`, `generation_records`, `map_versions` |
| **Append-only events** | Record signals about what happened | Insert-only, never updated | `resolution_outcomes` |
| **Derived aggregates** | Precomputed summaries for fast reads | Rebuilt from logs + events | `table_scores` |

Plus two existing tiers:
- **Mutable product data**: `maps` (aggregate root), `profiles`
- **Operational caches**: `clarify_cache`, `data_cache` (TTL-based, disposable)

### Domain objects

```
Map                         ← aggregate root (unchanged)
  ├── MapVersion            ← immutable snapshot (unchanged)
  ├── artifact_id → DatasetArtifact
  └── generation_records (via map_id FK)

DatasetArtifact             ← versioned, immutable data backing a map
  ├── query_fingerprint     ← identifies the query (source + params)
  ├── version               ← increments when upstream data changes
  ├── geojson stored in Supabase Storage (permanent URL)
  ├── profile, normalized_meta, provenance
  └── each row is immutable once written

ResolutionSession           ← immutable request log (one per clarify/search_data call)
  ├── prompt_key, prompt_original, topic_group
  ├── source_path (which source won)
  ├── winning_source_id, winning_table_id  ← stable key for outcome attribution
  ├── artifact_id (nullable)
  ├── created_at
  └── ResolutionAttempt[] (1-N, PxWeb only)

ResolutionAttempt           ← immutable, one table tried within a PxWeb session
  ├── session_id, ordinal
  ├── source_id, table_id
  ├── status, confidence, coverage_ratio, failure_reason, latency_ms
  └── PxWeb sources only — other sources produce sessions without attempts

ResolutionOutcome           ← append-only event
  ├── session_id
  ├── event_type (saved, abandoned, deleted, first_followup, ...)
  ├── payload (jsonb — structured per event_type)
  └── idempotency_key (prevents duplicate events)

TableScore                  ← derived aggregate for ranking (PxWeb only)
  ├── source_id, table_id, topic_group  ← per-topic, not global
  ├── win_count, save_count, abandon_count, ...
  ├── structural_fail_counts (join_failed, no_geo, ...)
  └── refreshed from sessions + attempts + outcomes

GenerationRecord            ← immutable, how a manifest was produced
  ├── map_id (FK, nullable) ← stable link from map to its generation
  ├── session_id (FK)       ← stable link from generation to its resolution
  ├── method (deterministic | ai | chat_edit)
  ├── model, attempts, quality_score, token_usage, latency_ms
  └── manifest (jsonb)

ClarifyCache, DataCache     ← operational speed caches (TTL, disposable)
```

### What changed from v2.1

| v2.1 | v3/v3.1 | Why |
|---|---|---|
| `resolution_sessions` was mutable (outcome, use_count, outcome_signals) | Immutable log — no outcome, no use_count, no mutable fields | A request log should not also be a feedback aggregate |
| `outcome_signals` JSONB merge on session | `resolution_outcomes` append-only table | Eliminates write-conflicts by construction |
| No aggregated scoring | `table_scores` derived aggregate | Ranking reads precomputed scores, not live joins |
| `table_scores` global per (source_id, table_id) | Per (source_id, table_id, **topic_group**) | A table's fitness varies by topic — "befolkning" ≠ "utbildning" |
| `UNIQUE (source_id, query_hash)` on artifact | `UNIQUE (source_id, query_fingerprint, version)` + `content_hash` | Same query can produce different data over time |
| First-followup as primary ranking signal | First-followup as best-effort telemetry (weight=0 until validated) | Signal accuracy unproven; classifier not designed for learning |
| Attempt-based learning implied for all sources | Explicitly PxWeb-only | Only PxWeb has a multi-table attempt loop |
| map→session link via indirect artifact_id lookup | Explicit: `maps.session_id` FK + `generation_records` as stable link | No guessing which session produced a map |
| `quality_score` on session (pre-generation table, post-generation value) | `quality_score` on `generation_records` only | Session is immutable and written before generation — quality is unknown at write time |
| Cached sessions invisible to table_scores (no attempt rows) | `winning_source_id`/`winning_table_id` on session, outcome attribution via session-level fields | Cached reuses must strengthen the winning table's score |
| `saved` + `abandoned` could coexist | `saved` and `abandoned` mutually exclusive; `saved` + `deleted` for save-then-delete | `abandoned` means "never saved"; deletion of a saved map is `deleted`, not `abandoned` |

---

## 4. Persistence Model

### New tables

```sql
-- Migration: 010_dataset_artifacts.sql

CREATE TABLE dataset_artifacts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         text NOT NULL,                -- "pxweb-se-scb", "eurostat", "osm"
  table_id          text,                         -- PxWeb table ID (null for non-PxWeb)
  query_fingerprint text NOT NULL,                -- deterministic hash of (source_id, table_id, dimension_selections, geo_level)
  version           int NOT NULL DEFAULT 1,       -- incremented when upstream data changes for same fingerprint
  geojson_url       text NOT NULL,                -- Supabase Storage permanent URL
  profile           jsonb NOT NULL,               -- DatasetProfile snapshot at creation time
  normalized_meta   jsonb,                        -- dimensions, metrics, source metadata
  provenance        jsonb NOT NULL,               -- full fetch params for reproducibility
  status            text NOT NULL DEFAULT 'map_ready'
                      CHECK (status IN ('map_ready', 'tabular_only')),
  feature_count     int NOT NULL,
  content_hash      text NOT NULL,                -- sha256 over canonical feature representation (see Artifact Versioning section)
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, query_fingerprint, version)
);

-- Fast lookup: "latest version for this query"
CREATE INDEX idx_artifact_fingerprint ON dataset_artifacts (source_id, query_fingerprint, version DESC);
-- FK lookups from maps
CREATE INDEX idx_artifact_source ON dataset_artifacts (source_id, table_id);
```

```sql
-- Migration: 011_resolution_sessions.sql

-- Immutable request log. One row per clarify or search_data call.
-- No outcome, no use_count, no mutable fields.
-- quality_score lives on generation_records, not here — sessions are written
-- before generation, so quality is unknown at session-write time.

CREATE TABLE resolution_sessions (
  id                uuid PRIMARY KEY,                 -- supplied by caller (crypto.randomUUID)
  prompt_key        text NOT NULL,                -- normalized prompt for grouping
  prompt_original   text NOT NULL,                -- verbatim user prompt
  topic_group       text NOT NULL,                -- coarse topic bucket (see Aggregation section)
  source_path       text,                         -- winning source: "pxweb", "eurostat", "overpass", etc. (null if failed)
  winning_source_id text,                         -- source_id of the winning resolution (e.g. "pxweb-se-scb")
  winning_table_id  text,                         -- table_id of the winning resolution (null for non-PxWeb)
  artifact_id       uuid REFERENCES dataset_artifacts(id),
  latency_ms        int,                          -- total resolution latency
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_prompt ON resolution_sessions (prompt_key);
CREATE INDEX idx_session_topic ON resolution_sessions (topic_group);
CREATE INDEX idx_session_created ON resolution_sessions (created_at DESC);
```

```sql
-- Migration: 012_resolution_attempts.sql

-- Immutable. One row per table tried in a PxWeb multi-table loop.
-- Only PxWeb sources produce these rows. Other sources have sessions without attempts.

-- Status taxonomy:
--   map_ready     — join succeeded, choropleth-renderable
--   tabular_only  — data found, no viable geometry join
--   no_geo        — table has no geographic dimension
--   no_data       — API returned empty or zero records
--   join_failed   — geometry loaded but coverage too low
--   wrong_level   — geographic level doesn't match user intent
--   unsupported   — metadata fetch failed or unrecoverable error

CREATE TABLE resolution_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES resolution_sessions(id) ON DELETE CASCADE,
  ordinal         int NOT NULL,                 -- 1-based attempt order
  source_id       text NOT NULL,                -- "pxweb-se-scb"
  table_id        text NOT NULL,                -- PxWeb table ID
  status          text NOT NULL
                    CHECK (status IN ('map_ready','tabular_only','no_geo','no_data','join_failed','wrong_level','unsupported')),
  confidence      real,
  coverage_ratio  real,                         -- null if join not attempted
  failure_reason  text,                         -- null on success
  latency_ms      int,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, ordinal)
);

CREATE INDEX idx_attempt_table ON resolution_attempts (source_id, table_id);
```

```sql
-- Migration: 017_resolution_outcomes.sql (renumbered — 013/014 already taken)

-- Append-only event log. Each row is one signal about a session.
-- Multiple events per session are normal (first_followup + saved, etc).
--
-- Idempotency: idempotency_key prevents duplicate events from client retries.
-- Events that may only occur once per session use session_id + event_type as key.
-- Events that may occur multiple times (manifest_edit) use a client-generated UUID.

CREATE TABLE resolution_outcomes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES resolution_sessions(id) ON DELETE CASCADE,
  event_type      text NOT NULL
                    CHECK (event_type IN (
                      'saved',              -- user saved the map
                      'abandoned',          -- user left without saving
                      'deleted',            -- user deleted the map
                      'first_followup',     -- classified first user action (telemetry)
                      'manifest_edit',      -- a chat-driven manifest change occurred
                      're_prompted'         -- user submitted a new prompt instead
                    )),
  payload         jsonb NOT NULL DEFAULT '{}',
  idempotency_key text NOT NULL,            -- prevents duplicate events
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

-- Idempotency rules:
--   saved:          key = "saved:{session_id}"           — at most once per session
--   abandoned:      key = "abandoned:{session_id}"       — at most once per session
--   deleted:        key = "deleted:{session_id}"         — at most once per session
--   first_followup: key = "followup:{session_id}"        — at most once per session
--   re_prompted:    key = "reprompted:{session_id}"       — at most once per session
--   manifest_edit:  key = "edit:{session_id}:{ordinal}"  — one per edit (ordinal from client)

CREATE INDEX idx_outcome_session ON resolution_outcomes (session_id);
CREATE INDEX idx_outcome_type ON resolution_outcomes (event_type);
```

```sql
-- Migration: 018_generation_records.sql (renumbered — 013/014 already taken)

CREATE TABLE generation_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id          uuid REFERENCES maps(id) ON DELETE SET NULL,
  session_id      uuid REFERENCES resolution_sessions(id),
  artifact_id     uuid REFERENCES dataset_artifacts(id),
  method          text NOT NULL
                    CHECK (method IN ('deterministic', 'ai', 'chat_edit')),
  model           text,                         -- "sonnet-4.5", "opus-4.5", null
  attempts        int NOT NULL DEFAULT 1,       -- AI retry count (not PxWeb attempt count)
  quality_score   int,
  token_usage     jsonb,
  latency_ms      int,
  manifest        jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

```sql
-- Migration: 015_table_scores.sql

-- Derived aggregate. Precomputed from sessions + attempts + outcomes.
-- Ranking reads this table, never joins raw logs.
--
-- Scope: PxWeb sources only in v1.
-- Granularity: per (source_id, table_id, topic_group).
-- A table's fitness varies by topic: BE0101N is great for "befolkning" but irrelevant
-- for "utbildning". Global per-table scores would mix signals from unrelated prompts.
-- See "Aggregation / Scoring Model" section for topic_group definition.

CREATE TABLE table_scores (
  source_id             text NOT NULL,
  table_id              text NOT NULL,
  topic_group           text NOT NULL,              -- coarse topic bucket (e.g. "population", "education", "income")

  -- Attempt-level counts (from resolution_attempts)
  attempt_count         int NOT NULL DEFAULT 0,
  map_ready_count       int NOT NULL DEFAULT 0,
  join_failed_count     int NOT NULL DEFAULT 0,
  no_geo_count          int NOT NULL DEFAULT 0,
  no_data_count         int NOT NULL DEFAULT 0,
  wrong_level_count     int NOT NULL DEFAULT 0,
  tabular_only_count    int NOT NULL DEFAULT 0,

  -- Session-level outcome counts (from resolution_outcomes for sessions where this table won)
  save_count            int NOT NULL DEFAULT 0,
  abandon_count         int NOT NULL DEFAULT 0,
  delete_count          int NOT NULL DEFAULT 0,

  -- Telemetry counts (from first_followup events, weight=0 until validated)
  followup_no_action    int NOT NULL DEFAULT 0,
  followup_style        int NOT NULL DEFAULT 0,
  followup_view         int NOT NULL DEFAULT 0,
  followup_data         int NOT NULL DEFAULT 0,
  followup_semantic     int NOT NULL DEFAULT 0,
  followup_restart      int NOT NULL DEFAULT 0,

  last_refreshed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, table_id, topic_group)
);
```

```sql
-- Migration: 016_maps_refs.sql

-- Stable link from map to its resolution session and artifact.
-- session_id is the definitive answer to "which resolution produced this map."
-- artifact_id is the definitive answer to "which data is this map showing."
-- Both are nullable for backward compat with legacy maps.

ALTER TABLE maps ADD COLUMN IF NOT EXISTS artifact_id uuid REFERENCES dataset_artifacts(id);
ALTER TABLE maps ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES resolution_sessions(id);
```

### Schema formalization (prerequisite — Phase 0)

Actual repo migrations (applied):

```
000_create_maps.sql                 — maps table
001_profiles_and_slugs.sql          — profiles + slugs
002_map_versions.sql                — immutable map snapshots
003_maps_rls.sql                    — RLS policies
004_chat_history.sql                — chat history
005_uploaded_datasets.sql           — user-uploaded datasets (not in original blueprint)
007_create_data_cache.sql           — data_cache + TTL
008_create_clarify_cache.sql        — clarify_cache + increment_clarify_hit function
009_create_clarify_resolutions.sql  — clarify_resolutions
```

Note: 006 is unused (gap). All new blueprint tables (010+) reference `maps` via FK.

### Existing tables — disposition

| Table | Action | Detail |
|---|---|---|
| `maps` | **Keep + extend** | Add `artifact_id`, `session_id`. `geojson_url` stays for backward compat. |
| `map_versions` | **Keep unchanged** | Immutable snapshots. |
| `profiles` | **Keep unchanged** | Auth-linked. |
| `data_cache` | **Keep as operational cache** | Formalized (007). TTL-based. Never canonical. |
| `clarify_cache` | **Keep as operational cache** | Formalized (008). TTL-based. |
| `clarify_resolutions` | **Replace** with `resolution_sessions` + `resolution_outcomes` | Currently active. Migrate existing rows. Drop after Phase 2 complete + 30 days. |
| `resolution-memory` (.next/cache) | **Delete** | Currently active. Replaced by `table_scores`. |
| `case-memory` (.next/cache) | **Delete** | Currently active. Replaced by `generation_records`. |
| `dataset-registry` (.next/cache) | **Delete** | Currently active. Not in original blueprint — needs migration target (reuse `clarify_resolutions` or new table). |

---

## 5. Shared Resolution Engine

### The problem

`clarify/route.ts` and `chat/route.ts` both resolve datasets with different orchestration logic. The same functions (`resolvePxWeb`, `searchEurostat`) are called but wrapped differently.

### Target: `resolveDataset()` — one function, two callers

```typescript
interface ResolveDatasetInput {
  prompt: string;
  allowedPaths?: Set<'catalog' | 'overpass' | 'pxweb' | 'data_commons' | 'eurostat' | 'worldbank' | 'registry' | 'web_research'>;
  skipAiSteps?: boolean;
}

interface ResolveDatasetResult {
  status: 'resolved' | 'tabular_only' | 'agency_hint' | 'not_found';
  artifact?: DatasetArtifact;
  session: ResolutionSession;       // immutable, already written
  attempts: ResolutionAttempt[];    // immutable, already written (empty for non-PxWeb)
  response: ClarifyResponse;        // backward-compatible shape
}
```

**Clarify route:** `resolveDataset({ prompt, allowedPaths: all })` — full waterfall.

**Chat search_data tool:** `resolveDataset({ prompt, allowedPaths: stats-only })` — subset.

Both produce: session row + attempt rows (PxWeb only) + artifact (if map_ready). Both use the same ranking, caching, and artifact creation logic.

### What `resolveDataset()` writes

1. `resolution_sessions` — one row, immediately on completion. Sets `winning_source_id` and `winning_table_id` from the winning result (both fresh and cached sessions carry these).
2. `resolution_attempts` — N rows for PxWeb, 0 rows for other sources
3. `dataset_artifacts` — one row if new data fetched and map_ready (checks for existing fingerprint+version first)
4. `data_cache` — operational cache entry (same as today, for pipeline speed)

It does NOT write outcomes. Outcomes are written by the client after user interaction.

### Scope of attempt-based learning

**PxWeb sources (SE, NO, FI, IS, DK, CH, EE, SI, LV):** Produce `resolution_attempts` rows. The multi-table loop instruments each try. `table_scores` accumulates per-table win/fail counts. Ranking reads `table_scores` to reorder candidates.

**All other sources (Eurostat, World Bank, Data Commons, Overpass, web research, catalog):** Produce `resolution_sessions` rows only. No attempt rows (there is only one "attempt"). Session-level outcomes (saved/abandoned/deleted) are recorded but do not feed into table-level ranking — there is no table to rank.

This is not a limitation to fix later. It reflects the actual structure of the code: only PxWeb has a multi-candidate resolution loop.

---

## 6. Runtime Flows

### Flow 1: New prompt, no cache hit

```
POST /api/ai/clarify
  → clarify_cache MISS
  → resolveDataset({ prompt, allowedPaths: all })
    → PxWeb: resolvePxWeb() tries tables[0..4]
      → attempt 1: table BE0101A → no_geo → attempt row written
      → attempt 2: table BE0101N → map_ready → attempt row written
    → check artifact: query_fingerprint exists?
      → YES, content_hash matches → reuse existing artifact
      → YES, content_hash differs → create new version
      → NO → create version 1
    → write session row (immutable, sets winning_source_id + winning_table_id)
    → write clarify_cache (operational, TTL)
    → return { artifact, session, response }
  → return ClarifyResponse {dataUrl, dataProfile, artifactId, sessionId}
```

### Flow 2: Prompt with clarify_cache hit

```
POST /api/ai/clarify
  → clarify_cache HIT
  → verify artifact exists (Storage URL → HEAD request, or trust cache TTL < artifact age)
  → create NEW session row:
      - copies winning_source_id, winning_table_id, artifact_id from cached result
      - no attempt rows (attempts are not re-run)
  → return cached response (with new sessionId)
```

Note: each request creates its own session. There is no `use_count` on sessions. If we need "how many times has this prompt been asked," we query `COUNT(*) FROM resolution_sessions WHERE prompt_key = $1`.

**Why cached sessions carry `winning_source_id` / `winning_table_id`:** The `table_scores` aggregate counts outcomes (saved/abandoned/deleted) per winning table. If cached sessions lacked these fields, a table that works well and gets reused heavily would gain zero outcome signal — its success would be invisible to the ranking. By copying the winning fields from the cached result, every save/abandon/delete against a cached session correctly attributes to the table that produced the data.

### Flow 3: Wrong dataset first, correct second (PxWeb multi-table)

```
resolveDataset → resolvePxWeb:
  → attempt 1: table 11ra (568 mixed Alue codes)
    → join_failed, coverage 0.12
    → attempt row: {ordinal:1, status:'join_failed', coverage:0.12}
  → attempt 2: table 11rf (19 MK codes only)
    → map_ready, coverage 0.89
    → attempt row: {ordinal:2, status:'map_ready', coverage:0.89}
  → session row: artifact from attempt 2

Later, table_scores refresh:
  → 11ra: join_failed_count += 1
  → 11rf: map_ready_count += 1

Future query with overlapping keywords:
  → ranking reads table_scores
  → 11ra deprioritized (high join_failed_count)
  → 11rf boosted (high map_ready_count)
```

### Flow 4: Deterministic generation

```
POST /api/ai/generate-map
  → load artifact by artifact_id
  → profile: Polygon + _atlas_value + ≥5 features
  → generateDeterministicManifest (sub-ms, zero tokens)
  → write generation_record (method:'deterministic', attempts:0, tokens:0)
  → return manifest
```

### Flow 5: AI generation

```
POST /api/ai/generate-map
  → load artifact
  → canGenerateDeterministic = false
  → Claude Sonnet loop (max 3 retries)
  → if quality < 60 → Opus fallback
  → write generation_record (method:'ai', model:'sonnet-4.5', attempts:3)
  → return manifest
```

### Flow 6: Edit via chat

```
POST /api/ai/chat (SSE)
  → classify skill: "style" | "data" | "insight" | "general"

  Case A — style/insight/general (no dataset change):
    → tool: update_manifest → validate → score
      → write generation_record (method:'chat_edit', session_id: existing)
      → emit manifest-update SSE
    → client: autosave via PATCH /api/maps/{id}
      → maps.session_id and maps.artifact_id are NOT updated (same data)

  Case B — data (new dataset):
    → tool: search_data
      → resolveDataset({ prompt, allowedPaths: stats-only })
      → new session + attempts (if PxWeb) written → new sessionId, new artifactId
      → returns {dataUrl, profile, sessionId, artifactId}
    → tool: update_manifest → validate → score
      → write generation_record (method:'chat_edit', session_id: NEW session)
      → emit manifest-update SSE
    → client: autosave via PATCH /api/maps/{id}
      → maps.session_id updated to new sessionId
      → maps.artifact_id updated to new artifactId
    → client sends outcome for PREVIOUS session:
      { event_type: "re_prompted", idempotency_key: "reprompted:{old_session_id}" }
```

**When do FKs update?** Only when `search_data` returns a *different* dataset. The test is: did `search_data` produce a new `sessionId`? If yes → update both `maps.session_id` and `maps.artifact_id` via PATCH. If `search_data` was not called (style/insight edit), the FKs stay unchanged.

This means `maps.session_id` always points to the session that produced the *currently displayed data*, and `maps.artifact_id` always points to the *currently displayed artifact*. The delete flow (Flow 10) can trust `maps.session_id` as the authoritative link because the edit flow keeps it current.

### Flow 7: User saves map

```
POST /api/maps (save)
  → create map row with artifact_id AND session_id
    (both passed from the client, which received them from clarify + generate-map)
  → client sends outcome event:
    POST /api/ai/outcome {
      session_id: "...",
      event_type: "saved",
      payload: { map_id: "..." },
      idempotency_key: "saved:{session_id}"
    }
  → INSERT INTO resolution_outcomes (deduplicated by idempotency_key)
```

### Flow 8: User abandons

```
Client detects: user navigates away without saving (beforeunload or route change)
  → POST /api/ai/outcome {
      session_id: "...",
      event_type: "abandoned",
      payload: {},
      idempotency_key: "abandoned:{session_id}"
    }
  → INSERT (deduplicated)
```

### Flow 9: User re-prompts

```
Client detects: new clarify call from same page
  → POST /api/ai/outcome for PREVIOUS session {
      session_id: previous_session_id,
      event_type: "re_prompted",
      payload: {},
      idempotency_key: "reprompted:{previous_session_id}"
    }
  → IF previous session was NOT saved:
    → POST /api/ai/outcome for PREVIOUS session {
        session_id: previous_session_id,
        event_type: "abandoned",
        payload: {},
        idempotency_key: "abandoned:{previous_session_id}"
      }
  → (If previous session WAS saved, do NOT emit abandoned — saved+abandoned is invalid)
  → New clarify request creates a new session
```

### Flow 10: User deletes map

```
DELETE /api/maps/{id}
  → Read map.session_id before deletion (the stable link)
  → DELETE maps row
    → FK cascades: generation_records.map_id → SET NULL
    → maps.session_id and maps.artifact_id refs are simply removed (row deleted)
    → resolution_sessions row is NOT deleted (immutable log)
    → dataset_artifacts row is NOT deleted (other maps may reference it)
  → POST outcome event using the saved session_id:
    { event_type: "deleted", payload: { map_id: "..." }, idempotency_key: "deleted:{session_id}" }
```

The `maps.session_id` FK provides the stable, explicit link. No guessing via artifact_id + ORDER BY. Sessions don't carry a `map_id` because a session is created before a map exists and many sessions never produce a map — the map points to the session, not the reverse.

### Flow 11: First follow-up (telemetry)

```
Map renders in editor
  → Client starts timer, stores initial manifest snapshot

User's first chat interaction:
  → Client classifies: classifyFirstFollowup(message, toolCalls, manifestDiff)
  → POST /api/ai/outcome {
      session_id: "...",
      event_type: "first_followup",
      payload: {
        category: "style_refinement",
        seconds_to_action: 14,
        first_tool: "update_manifest",
        classifier_version: "regex-v1",     // tracks which classifier produced this
        confidence: null                     // future: classifier confidence score
      },
      idempotency_key: "followup:{session_id}"
    }
  → INSERT (deduplicated — at most one first_followup per session)
```

---

## 7. Learning Model

### Three tiers

| Tier | Tables | Mutability | Purpose |
|---|---|---|---|
| **Immutable logs** | `resolution_sessions`, `resolution_attempts`, `generation_records`, `map_versions` | Write-once | "What happened" |
| **Append-only events** | `resolution_outcomes` | Insert-only | "What the user did about it" |
| **Derived aggregates** | `table_scores` | Rebuilt periodically | "What should we do next time" |

### Outcome event idempotency

| event_type | idempotency_key pattern | Max per session | Notes |
|---|---|---|---|
| `saved` | `saved:{session_id}` | 1 | Client may retry POST — deduped |
| `abandoned` | `abandoned:{session_id}` | 1 | User left without saving |
| `deleted` | `deleted:{session_id}` | 1 | User deleted a previously saved map |
| `first_followup` | `followup:{session_id}` | 1 | Classified first interaction |
| `re_prompted` | `reprompted:{session_id}` | 1 | User submitted new prompt instead |
| `manifest_edit` | `edit:{session_id}:{ordinal}` | N | One per chat-driven edit, ordinal assigned by client |

Duplicate INSERTs on the same `idempotency_key` are silently ignored (Postgres `ON CONFLICT (idempotency_key) DO NOTHING`). The client can safely retry any outcome POST without risk of double-counting.

### Outcome lifecycle scenarios

These are the exhaustive user lifecycle paths and the exact outcome events each produces:

| Scenario | User action | Outcome events on session | Notes |
|---|---|---|---|
| **Save only** | User generates map → saves | `saved` | Happy path. May also have `first_followup` and `manifest_edit` events. |
| **Save then delete** | User saves → later deletes | `saved`, `deleted` | Both events coexist. `saved` + `deleted` is the correct pair (not `abandoned`). `abandoned` means "never saved at all." |
| **Abandon** | User generates → navigates away without saving | `abandoned` | Fired on `beforeunload` or route change. `saved` and `abandoned` are **mutually exclusive** — the client never emits both for the same session. |
| **Re-prompt, previous abandoned** | User generates → submits a new prompt | `re_prompted`, `abandoned` (on previous session) | Both events are written to the *previous* session. The new prompt creates a fresh session. `re_prompted` signals "user wanted different data." `abandoned` signals "the previous result was not saved." |
| **Chat data-edit** | User generates → chat changes dataset | `re_prompted` (on previous session), new session created | Previous session gets `re_prompted`. Whether previous also gets `abandoned` depends on whether the user saves before or after the data change. If they save after → previous gets `abandoned`, new session eventually gets `saved`. |

**Mutual exclusivity rules:**
- `saved` and `abandoned` **never** coexist on the same session. A session is either saved or not.
- `saved` and `deleted` **may** coexist. Deletion is a lifecycle event after saving, not a substitute for it.
- `re_prompted` may coexist with either `saved` or `abandoned` — it signals that the user moved on, regardless of whether they saved first.
- `first_followup` may coexist with any terminal state (`saved`, `abandoned`, or `deleted`).

### What ranking reads in production

Ranking reads `table_scores`. Never raw logs. This is a single-table lookup:

```sql
SELECT * FROM table_scores
WHERE source_id = $1 AND table_id = ANY($2) AND topic_group = $3;
```

No joins, no aggregation, no GIN scans at query time. The cost of ranking is O(candidate_tables) lookups on a small table. If no rows match the topic_group (cold topic), ranking falls back to base ranking only — no learned signal, which is the correct behavior for an unknown topic.

### First-followup: best-effort telemetry — not a product signal

First-followup events are collected in `resolution_outcomes` and counted in `table_scores` (the `followup_*` columns). But in v1:

**All followup weights in the ranking algorithm are 0. This is not just a cautious default — it reflects that the signal is unvalidated.**

The epistemological status of first-followup data:

1. **The classifier is unverified.** `classifyChatSkill()` was designed for tool selection (wrong classification → AI gets slightly wrong tools, which is recoverable). As a learning signal, wrong classification → permanent ranking distortion. Known edge cases exist (e.g., "show restaurants as a heatmap in Paris" → classified as `style` when it's `data`).

2. **The source-comparison assumption is unimplemented.** `searchReturnedDifferentSource` requires `search_data` to return structured `source_id`/`table_id`. The tool currently returns `source: "PxWeb (SCB)"` — a display name that doesn't match `source_id: "pxweb-se-scb"`. Until this is fixed, `semantic_correction` vs `data_refinement` distinction is unreliable.

3. **Client-side detection has systematic bias.** `no_followup` and `restart` are underreported (tab close, browser back — no event fires). `style_refinement` and `semantic_correction` are reliably reported (they happen via chat). This means negative signals may be overrepresented relative to positive ones.

4. **The categories are not yet empirically validated.** The taxonomy (6 categories) is plausible but unproven. It is possible that the actual distribution is: 80% `no_followup`, 15% `style_refinement`, 5% everything else — in which case only two of six categories carry meaningful signal.

**Activation criteria (all three required):**

1. ≥200 sessions with first_followup events accumulated
2. Manual labeling of 50 random sessions confirms ≥70% classifier accuracy
3. Statistical correlation: `semantic_correction` → `abandoned`/`deleted` outcome at ≥2x the base rate

Until all three are met, first-followup is **observational data only**. It must not be cited as evidence of resolution quality. Analyses built on this data must disclose the unverified classifier.

---

## 8. Aggregation / Scoring Model

### Why per-topic, not global

A global `table_scores` row per `(source_id, table_id)` would blend signals from unrelated prompts. Table BE0101N is excellent for "befolkning per kommun" but irrelevant for "utbildning per kommun." If both prompts produce attempts against BE0101N, a global score mixes population-success with education-failure into one number. The ranking becomes fast but miscalibrated.

`table_scores` is keyed on `(source_id, table_id, topic_group)` — one row per table per topic.

### topic_group definition

A `topic_group` is a coarse topic bucket derived from the prompt at session creation time. It is **not** a keyword set — it's a small, closed vocabulary (~20 values) that groups prompts by statistical domain.

```typescript
// Implemented in resolution-logger.ts (18 patterns as of v3.2).
// The listing below is illustrative — resolution-logger.ts is authoritative.

const TOPIC_PATTERNS: [RegExp, string][] = [
  [/\b(befolkning|population|invånar|...)/i, "population"],
  [/\b(bnp|gdp|ekonomi|economy|...)/i, "economy"],
  [/\b(arbets|employ|unemploy|...)/i, "labor"],
  [/\b(bostad|housing|hyra|...)/i, "housing"],
  [/\b(skol|school|utbildning|...)/i, "education"],
  [/\b(hälsa|health|sjukvård|...)/i, "health"],
  [/\b(miljö|environment|climate|...)/i, "environment"],
  [/\b(transport|trafik|traffic|...)/i, "transport"],
  [/\b(brott|crime|polis|...)/i, "crime"],
  [/\b(skatt|tax|inkomst|income|...)/i, "income"],
  [/\b(energi|energy|elprod|...)/i, "energy"],
  [/\b(handel|trade|export|...)/i, "trade"],
  [/\b(jordbruk|agriculture|...)/i, "agriculture"],
  [/\b(valresultat|election|...)/i, "elections"],
  // + weather, poi, accessibility patterns
];

function classifyTopicGroup(prompt: string): string {
  for (const [pattern, group] of TOPIC_PATTERNS) {
    if (pattern.test(prompt)) return group;
  }
  return "other";  // catch-all — still scored, but separately from known topics
}
```

Properties:
- **Deterministic.** Same prompt always produces the same topic_group.
- **Coarse by design.** ~20 buckets, not hundreds. Each bucket accumulates enough data to be statistically useful.
- **`other` is valid.** Prompts that don't match any pattern go to `other`. Their table_scores rows are separate from known topics. This prevents unknown prompts from polluting known-topic scores.
- **Stored on the session.** `resolution_sessions.topic_group` is written once, immutably. The topic_group of historical sessions never changes even if the regex patterns are updated.

### Source of truth

The source of truth is always the immutable logs + append-only events:
- `resolution_sessions` + `resolution_attempts` — what happened structurally
- `resolution_outcomes` — what the user did

`table_scores` is a **derived aggregate** — a materialized cache of counts. It can be rebuilt from scratch at any time by re-aggregating the source tables. If `table_scores` is corrupted or suspect, `TRUNCATE table_scores` and rebuild.

### How the aggregate is built

```sql
-- Full rebuild function: refresh_table_scores()
-- Replaces all rows. Safe to call at any time.
--
-- Two data sources:
--   1. resolution_attempts — structural counts (map_ready, no_geo, etc.)
--      Only PxWeb sessions have attempt rows.
--   2. resolution_sessions.winning_source_id/winning_table_id — outcome counts
--      ALL sessions (including cache-hit sessions with no attempts) carry the
--      winning table, so outcomes always attribute to the correct table.

TRUNCATE table_scores;

-- CTE 1: structural counts from attempts
WITH attempt_counts AS (
  SELECT
    ra.source_id,
    ra.table_id,
    rs.topic_group,
    COUNT(*)                                          as attempt_count,
    COUNT(*) FILTER (WHERE ra.status = 'map_ready')   as map_ready_count,
    COUNT(*) FILTER (WHERE ra.status = 'join_failed') as join_failed_count,
    COUNT(*) FILTER (WHERE ra.status = 'no_geo')      as no_geo_count,
    COUNT(*) FILTER (WHERE ra.status = 'no_data')     as no_data_count,
    COUNT(*) FILTER (WHERE ra.status = 'wrong_level') as wrong_level_count,
    COUNT(*) FILTER (WHERE ra.status = 'tabular_only') as tabular_only_count
  FROM resolution_attempts ra
  JOIN resolution_sessions rs ON ra.session_id = rs.id
  GROUP BY ra.source_id, ra.table_id, rs.topic_group
),

-- CTE 2: outcome + followup counts from sessions (uses winning_* fields)
-- This includes ALL sessions — both fresh (with attempts) and cached (without).
outcome_counts AS (
  SELECT
    rs.winning_source_id                              as source_id,
    rs.winning_table_id                               as table_id,
    rs.topic_group,
    COUNT(DISTINCT rs.id) FILTER (WHERE ro.event_type = 'saved')     as save_count,
    COUNT(DISTINCT rs.id) FILTER (WHERE ro.event_type = 'abandoned') as abandon_count,
    COUNT(DISTINCT rs.id) FILTER (WHERE ro.event_type = 'deleted')   as delete_count,
    COUNT(DISTINCT rs.id) FILTER (WHERE ff.payload->>'category' = 'no_followup')         as followup_no_action,
    COUNT(DISTINCT rs.id) FILTER (WHERE ff.payload->>'category' = 'style_refinement')    as followup_style,
    COUNT(DISTINCT rs.id) FILTER (WHERE ff.payload->>'category' = 'view_refinement')     as followup_view,
    COUNT(DISTINCT rs.id) FILTER (WHERE ff.payload->>'category' = 'data_refinement')     as followup_data,
    COUNT(DISTINCT rs.id) FILTER (WHERE ff.payload->>'category' = 'semantic_correction') as followup_semantic,
    COUNT(DISTINCT rs.id) FILTER (WHERE ff.payload->>'category' = 'restart')             as followup_restart
  FROM resolution_sessions rs
  LEFT JOIN resolution_outcomes ro ON ro.session_id = rs.id AND ro.event_type IN ('saved','abandoned','deleted')
  LEFT JOIN resolution_outcomes ff ON ff.session_id = rs.id AND ff.event_type = 'first_followup'
  WHERE rs.winning_source_id IS NOT NULL
    AND rs.winning_table_id IS NOT NULL
  GROUP BY rs.winning_source_id, rs.winning_table_id, rs.topic_group
)

INSERT INTO table_scores (
  source_id, table_id, topic_group,
  attempt_count, map_ready_count, join_failed_count, no_geo_count,
  no_data_count, wrong_level_count, tabular_only_count,
  save_count, abandon_count, delete_count,
  followup_no_action, followup_style, followup_view,
  followup_data, followup_semantic, followup_restart,
  last_refreshed_at
)
SELECT
  COALESCE(a.source_id, o.source_id),
  COALESCE(a.table_id, o.table_id),
  COALESCE(a.topic_group, o.topic_group),
  COALESCE(a.attempt_count, 0),
  COALESCE(a.map_ready_count, 0),
  COALESCE(a.join_failed_count, 0),
  COALESCE(a.no_geo_count, 0),
  COALESCE(a.no_data_count, 0),
  COALESCE(a.wrong_level_count, 0),
  COALESCE(a.tabular_only_count, 0),
  COALESCE(o.save_count, 0),
  COALESCE(o.abandon_count, 0),
  COALESCE(o.delete_count, 0),
  COALESCE(o.followup_no_action, 0),
  COALESCE(o.followup_style, 0),
  COALESCE(o.followup_view, 0),
  COALESCE(o.followup_data, 0),
  COALESCE(o.followup_semantic, 0),
  COALESCE(o.followup_restart, 0),
  now()
FROM attempt_counts a
FULL OUTER JOIN outcome_counts o
  ON a.source_id = o.source_id
  AND a.table_id = o.table_id
  AND a.topic_group = o.topic_group;
```

### When it's refreshed

**On-write incremental + periodic full rebuild.**

- **Incremental:** After `resolveDataset()` completes, atomic `UPDATE table_scores SET map_ready_count = map_ready_count + 1 WHERE source_id = $1 AND table_id = $2 AND topic_group = $3`. If no row exists, `INSERT ... ON CONFLICT DO UPDATE`. This handles attempt-level counts with zero latency.
- **Periodic full rebuild:** Supabase cron job calls `refresh_table_scores()` every 15 minutes. This picks up outcome events and corrects drift from failed incremental writes.
- **Manual rebuild:** `SELECT refresh_table_scores()` at any time.

Structural signals (attempt success/failure) are near-real-time via incremental. Outcome signals are delayed by at most 15 minutes via periodic rebuild. This latency is acceptable — behavioral signals don't need sub-second freshness.

### Ranking algorithm

```python
def rank_candidates(source_id, topic_group, candidate_table_ids):
    scores = query(
        "SELECT * FROM table_scores WHERE source_id = :s AND table_id = ANY(:ids) AND topic_group = :t",
        s=source_id, ids=candidate_table_ids, t=topic_group
    )

    for table in candidate_table_ids:
        s = scores.get(table.id)
        if not s:
            table.learned_score = 0  # no history for this topic — neutral
            continue

        score = 0

        # Layer 1: Structural (from attempts — always active)
        score += s.map_ready_count * 2
        score -= s.join_failed_count * 5
        score -= s.no_geo_count * 4
        score -= s.wrong_level_count * 2
        score -= s.tabular_only_count * 1

        # Layer 2: Outcome (from events — always active)
        score += s.save_count * 3
        score -= s.abandon_count * 2
        score -= s.delete_count * 3

        # Layer 3: Telemetry (from first_followup — WEIGHT = 0 in v1)
        FOLLOWUP_WEIGHT = 0  # activated after validation, see section 7
        score += s.followup_no_action * 2 * FOLLOWUP_WEIGHT
        score += s.followup_style * 1 * FOLLOWUP_WEIGHT
        score -= s.followup_semantic * 4 * FOLLOWUP_WEIGHT
        score -= s.followup_restart * 2 * FOLLOWUP_WEIGHT

        table.learned_score = score

    # Merge with base ranking (keyword match, geo-level boost, plugin known tables)
    return sorted(candidates, key=lambda t: -(t.base_rank_score + t.learned_score))
```

---

## 9. Artifact Versioning Model

### Two separate questions

1. **Query identity:** "What data was requested?" → `query_fingerprint`
2. **Content identity:** "What data was received?" → `content_hash`

Separating these answers two different questions:
- "Is this the same query as last time?" (fingerprint match → maybe reuse)
- "Did the upstream source return different data?" (content_hash mismatch → new version)

### query_fingerprint: what was requested

A deterministic hash of the parameters that define the API call:

```typescript
function computeFingerprint(params: {
  sourceId: string;
  tableId: string | null;
  dimensionSelections: PxDimensionSelection[];
  geoLevel: string;
}): string {
  const canonical = JSON.stringify({
    s: params.sourceId,
    t: params.tableId,
    d: params.dimensionSelections
        .sort((a, b) => a.dimensionId.localeCompare(b.dimensionId))
        .map(d => ({ id: d.dimensionId, v: d.valueCodes.sort() })),
    g: params.geoLevel,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}
```

Two requests with the same `query_fingerprint` asked for the same data. They may have received different data if the upstream source changed.

### content_hash: what was received

A sha256 over a **canonical representation of the entire joined GeoJSON**, not just `_atlas_value`. The hash input includes:

1. **Feature count** — detects added/removed features (e.g., new municipality created)
2. **Feature codes** — sorted join keys (`_atlas_code` or the geo dimension code) — detects feature identity changes
3. **Feature values** — sorted `_atlas_value` per feature — detects data value changes
4. **Metric label** — `_atlas_metric_label` — detects if the source renamed the metric

```typescript
function computeContentHash(features: GeoJSON.Feature[]): string {
  // Build a canonical representation that captures meaningful changes
  const canonical = features
    .map(f => ({
      code: f.properties?._atlas_code ?? f.properties?.scb_code ?? '',
      value: f.properties?._atlas_value ?? null,
      metric: f.properties?._atlas_metric_label ?? '',
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const input = JSON.stringify({
    n: features.length,
    f: canonical,
  });

  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}
```

**What triggers a new version (content_hash mismatch):**
- Upstream data values changed (SCB quarterly update)
- Features added or removed (new municipality, merged regions)
- Metric renamed by the source

**What does NOT trigger a new version (same content_hash):**
- Geometry shape changes (polygon boundaries adjusted) — not included in hash. This is a deliberate choice: boundary micro-adjustments are cosmetic and don't affect the statistical data the map shows. Including geometry in the hash would create spurious versions every time a geometry file is updated.
- `_atlas_data_fields` array order changes — not included.
- Properties not in the canonical set — not included.

**Why not hash the full GeoJSON?** A full-GeoJSON hash would catch every geometry vertex change, every floating-point rounding difference, every property ordering variation. This creates false-positive version bumps that don't reflect meaningful data changes. The canonical representation captures what matters for the map's information content.

### When a new version is created

During `resolveDataset()`, after data is fetched and joined:

```
1. Compute query_fingerprint from fetch params
2. Compute content_hash from joined features
3. Query: SELECT id, version, content_hash
          FROM dataset_artifacts
          WHERE source_id = $1 AND query_fingerprint = $2
          ORDER BY version DESC LIMIT 1
4. If no existing artifact → upload GeoJSON to Storage, create version 1
5. If existing AND content_hash matches → reuse existing artifact (return its id)
6. If existing AND content_hash differs → upload new GeoJSON, create version = max + 1
```

Step 5 is the common case — most re-fetches return the same data. No Storage upload, no new row.

### How old maps keep working

Maps reference `artifact_id` (a UUID pointing to a specific row). Each artifact row is immutable — its `geojson_url` points to a permanent file in Supabase Storage. When a new version is created, it's a new row with a new UUID. Old maps still point to the old row.

```
Map A (created January) → artifact_id = abc → version 1 (jan data, permanent Storage URL)
Map B (created June)    → artifact_id = def → version 2 (jun data, different Storage URL)
```

Both maps work forever. Neither artifact row is ever modified or deleted. Neither Storage file is ever overwritten.

### Staleness detection

When `resolveDataset()` finds a `clarify_cache` hit, staleness is checked by artifact age:

- **Artifact < 24 hours old:** Trust it. Skip re-fetch entirely.
- **Artifact 1–7 days old:** Re-fetch data from upstream, compute content_hash, compare against latest version. If match → reuse (no new version). If mismatch → new version. Cost: one upstream API call + hash comparison.
- **Artifact > 7 days old:** Always re-fetch. Create new version if content changed.

These thresholds are per-source defaults, configurable:

| Source type | Default max-age before re-check | Reasoning |
|---|---|---|
| PxWeb (SCB, SSB, etc.) | 7 days | Statistical data updates quarterly/annually |
| Eurostat | 7 days | Similar update frequency |
| World Bank | 30 days | Annual updates |
| Overpass (POI) | 24 hours | OSM data changes frequently |
| Web research | 24 hours | Web sources are volatile |

---

## 10. Migration Plan

### Dependency order

Migrations must land in this order. Existing migrations (000–009) cover schema formalization. Phases 1–5 (010–016) add new tables. All new tables reference `maps` via FK, which exists in migration 000.

> **⚠ MIGRATION NUMBER CONFLICT (2026-04-03):**
> Migrations 013 and 014 were used for `data_cache_pinned_and_meta` and `durable_dataset_storage`
> (extending dataset_artifacts + adding maps.artifact_id/data_status), NOT for resolution_outcomes
> and generation_records as described below. Phase 0 migrations 000, 005, 007, 008, 009 also
> do not exist in the repo — only 001–004 exist. Future phases must use migration numbers 015+.
> The descriptions below show the INTENDED design, not the actual repo state.

```
Phase 0 (prerequisite):  001–004  profiles, map_versions, RLS, chat_history  [implemented]
Phase 1:                 010      dataset_artifacts                          [partial]
Phase 1b:                013–014  data_cache pinned+meta, durable storage    [implemented — NOT in original plan]
Phase 2:                 015–016  resolution_sessions + attempts             [not started — renumbered]
Phase 3:                 017–018  resolution_outcomes + generation_records   [not started — renumbered]
Phase 4:                 019      table_scores                               [not started]
Phase 5:                 —        telemetry validation                       [not started]
Phase 6:                 —        cleanup                                    [not started]
```

Each phase depends on the previous. No phase can be applied out of order.

**Phase status vocabulary:**
- `[implemented]` — migration applied, write + read paths active, exit criteria met
- `[partial]` — migration applied and/or write path active, but read path or exit criteria incomplete
- `[not started]` — no migration applied, no code written

### Operational prerequisites (not architecture phases)

These are not part of the blueprint's architecture model. They are operational cleanup and measurement prerequisites that gate further work.

**Config cleanup** `[implemented]` — Dead searchPxWeb() code removed, language mapping unified to shared `COUNTRY_TO_PXWEB_LANGUAGE`, canary table aligned (TAB638→TAB694), coverage thresholds extracted to shared `MIN_COVERAGE_RATIO`. See `docs/next-steps-plan.md` Phase A.

**E2e eval baseline** `[not started]` — Extend eval-10-prompts.ts with ~20 prompts, expectedFamily, Haiku judge. Provides safety net before pipeline changes. See `docs/next-steps-plan.md` Phase B.

**Interim learning bridge** — `docs/next-steps-plan.md` proposes a Postgres VIEW bridge (`learned_table_candidates`) as temporary scaffolding toward `table_scores`. This bridge is not part of the blueprint's target model. It is a pragmatic interim measure: resolution-memory.ts would query the VIEW instead of .next/cache/ JSON, using topic_group as a coarser approximation of keyword matching. The VIEW is explicitly temporary — replaced and dropped when Phase 4 (table_scores) ships.

### Phase 0: Schema formalization (zero risk) `[implemented]`

Existing tables formalized via migrations:

```
000_create_maps.sql                 — maps table
001_profiles_and_slugs.sql          — profiles + slugs
002_map_versions.sql                — immutable snapshots
003_maps_rls.sql                    — RLS policies
004_chat_history.sql                — chat history
005_uploaded_datasets.sql           — user-uploaded datasets
007_create_data_cache.sql           — data_cache + TTL
008_create_clarify_cache.sql        — clarify_cache + increment_clarify_hit
009_create_clarify_resolutions.sql  — clarify_resolutions
```

Note: 006 is unused (gap in numbering).

**Exit criterion:** `supabase db reset` produces the complete schema from migrations alone. All tables in `types.ts` exist in migration chain. `increment_clarify_hit` function exists and is callable.

### Phase 1: DatasetArtifact + Supabase Storage (low risk) `[partial]`

```
010_dataset_artifacts.sql
```

Add `dataset_artifacts` table. Create `artifacts` Storage bucket. Modify `resolveOneTable()` to write artifacts for map_ready results. Implement `computeFingerprint()` and `computeContentHash()`. Maps still use `geojson_url` — artifacts are written but not consumed by map loading yet.

**Current state:** Migration 010 applied. `saveArtifact()` in `artifact.ts` writes rows fire-and-forget for PxWeb map_ready results (called from `pxweb-resolution.ts`). No Storage bucket created. No read path or switchover — maps still load from `data_cache`/`geojson_url`.

**Files:** migration 010, `pxweb-resolution.ts`, Storage bucket config.
**Exit criterion:** Every new map_ready resolution writes an artifact row. Existing flow unchanged.

### Phase 2: Resolution sessions + attempts + shared engine (medium risk) `[partial]`

```
011_resolution_sessions.sql
012_resolution_attempts.sql
```

Sub-phases with feature flags:

**2a:** Create tables. Create `resolveDataset()` as a thin wrapper around existing clarify logic. Implement `classifyTopicGroup()`. Feature-flagged off.

**2b:** Switch `chat/route.ts` `search_data` tool to call `resolveDataset()`. Feature-flagged.

**2c:** Switch `clarify/route.ts` to call `resolveDataset()`. Feature-flagged.

**2d:** Enable session + attempt writes inside `resolveDataset()`. Feature-flagged.

Each sub-phase is independently deployable and reversible (flag off → old codepath).

**Current state:** Migrations 011+012 applied. `resolution-logger.ts` writes sessions+attempts fire-and-forget from `resolvePxWeb()` only. `classifyTopicGroup()` implemented with 18 regex patterns. `artifact_id` on sessions is always null (callers never pass it). No `resolveDataset()` wrapper exists — two separate pipelines remain. Non-PxWeb sources produce no session rows.

**Files:** migrations 011-012, new `resolve-dataset.ts`, refactored `clarify/route.ts`, refactored `chat/route.ts`.
**Exit criterion:** Both clarify and chat produce session+attempt records. `resolution-memory.json` no longer read. Same prompt produces same result as before (regression test against top 50 prompts).

### Phase 3: Outcomes + telemetry + generation records (low risk) `[not started]`

```
017_resolution_outcomes.sql
018_generation_records.sql
```

Add `resolution_outcomes` table. Add `generation_records` table. Add `POST /api/ai/outcome` endpoint. Client reports: saved, abandoned, re_prompted, first_followup (best-effort telemetry, weight=0). Replace `case-memory.ts` filesystem writes with DB writes.

**Files:** migrations 013-014, new `outcome/route.ts`, new `first-followup-classifier.ts`, client-side tracking, refactored `case-memory.ts`.
**Exit criteria:**
- `.next/cache/atlas-cases/` no longer written
- Outcome events appear in DB for >80% of sessions
- first_followup events collected (weight=0 — no ranking impact, treated as unvalidated telemetry)

### Phase 4: Table scores + ranking (medium risk) `[not started]`

```
015_table_scores.sql
```

Add `table_scores` table with `(source_id, table_id, topic_group)` key. Implement incremental update in `resolveDataset()`. Implement periodic full rebuild (Supabase cron, 15 min). Enable ranking to read `table_scores`. A/B test: old ranking vs new ranking.

When this phase ships, the interim VIEW bridge (if deployed) is dropped: `DROP VIEW learned_table_candidates`.

**Files:** migration 015, `resolve-dataset.ts` ranking logic, `refresh_table_scores()` function, cron job config, A/B logging.
**Exit criteria:**
- `table_scores` populated for all PxWeb sources across observed topic_groups
- Ranking reads per-topic scores — first-attempt success rate measurable
- A/B comparison shows ≥10% improvement over 100+ sessions

### Phase 5: Maps → artifact_id + session_id switchover (medium risk) `[not started]`

```
016_maps_refs.sql
```

Add `artifact_id` and `session_id` to maps. On save, write both. On load, prefer artifact → Storage URL over `geojson_url`. On delete, read `session_id` for outcome event. Fallback to `geojson_url` for legacy maps (artifact_id = null).

**Files:** migration 016, `POST /api/maps`, `GET /api/maps/{id}`, `DELETE /api/maps/{id}`, `load-public-map.ts`.
**Exit criterion:** New maps always have artifact_id + session_id. Legacy maps load via geojson_url. Delete flow reads session_id directly (no guessing). No 404s.

### Phase 6: Telemetry validation + followup activation (depends on data) `[not started]`

No migration. Analysis + code change only.

Analyze accumulated first_followup events:
1. Export all `first_followup` outcomes joined with `saved`/`abandoned`/`deleted` outcomes for the same sessions
2. Manually label 50 random sessions: does the classifier agree with a human?
3. Compute correlation: does `semantic_correction` predict `abandoned`/`deleted` at ≥2x base rate?

If all three validation criteria pass:
- Set `FOLLOWUP_WEIGHT = 1` in ranking algorithm
- Monitor for 2 weeks
- Adjust or disable based on measured impact

If validation fails: keep as telemetry. Improve classifier (possibly Haiku LLM). Re-evaluate after next 200 sessions.

**Exit criterion:** Decision documented: activate with specific weights, improve classifier, or shelve. No default to activation.

### Phase 7: Cleanup `[not started]`

- Delete `resolution-memory.ts`
- Delete filesystem logic in `case-memory.ts` (keep interface, backed by DB)
- Delete `dataset-registry.ts` filesystem logic
- Deprecate `geojson_url` on maps (documentation only — column stays for legacy)
- Drop `clarify_resolutions` table (30 days after Phase 2 complete)

**Exit criterion:** No `.next/cache` learning files. All persistence in Supabase Postgres + Storage.

---

## 11. Guardrails

1. **No `.next/cache` learning stores.** All learning writes go to Postgres.
2. **No tables without migrations.** `supabase db reset` must produce the complete schema. Phase 0 is a hard prerequisite.
3. **Immutable logs are never updated.** `resolution_sessions`, `resolution_attempts`, `generation_records` — write-once.
4. **Outcome events are append-only.** `resolution_outcomes` — insert-only, deduplicated by `idempotency_key`. No UPDATE, no DELETE (except cascade).
5. **`table_scores` is always rebuildable.** It can be truncated and reconstructed from source tables at any time. It is never the source of truth.
6. **Cache is never truth.** `data_cache` and `clarify_cache` are operational. `dataset_artifacts` is canonical.
7. **Outcome writes are fire-and-forget.** Never block user experience.
8. **Artifact rows are immutable.** New upstream data = new version row, not an update to an existing row.
9. **First-followup is unvalidated telemetry.** Weights = 0 until classifier accuracy and outcome correlation are empirically verified. Analyses using this data must disclose the unverified classifier.
10. **Attempt-based learning is PxWeb-only in v1.** Other sources get session-level outcome tracking but no table-level ranking. This is a scope statement, not a limitation to fix.
11. **Maps carry explicit session_id.** The link from a saved map to its resolution session is a direct FK, not an inferred lookup.

---

## 12. Final Recommendation

**`maps` stays as aggregate root.** Users think in maps. Every other object exists to produce or improve a map.

**`DatasetArtifact` with versioning is the most important new building block.** `query_fingerprint` identifies the question. `content_hash` identifies the answer. `version` separates them in time. Old maps keep working because each artifact row is immutable and its Storage URL never changes. New data from the same query creates a new row, not an update. "Permanent" means permanent.

**Content_hash is deliberately scoped.** It hashes feature codes, values, count, and metric labels — not geometry vertices or property ordering. Geometry boundary changes are cosmetic; data value changes are substantive. This is a conscious tradeoff: fewer false-positive versions at the cost of missing purely geometric changes.

**Three-tier persistence: no object serves two masters.** Immutable logs (sessions, attempts) record what happened. Append-only events (outcomes) record what the user did. Derived aggregates (table_scores) precompute what to do next time. Sessions are never mutated. Outcome events never collide. table_scores can be rebuilt from scratch.

**Per-topic scoring prevents cross-contamination.** `table_scores` is keyed on `(source_id, table_id, topic_group)`, not global per table. A table that works for "befolkning" but fails for "utbildning" carries separate scores for each. The topic_group is coarse (~20 buckets) — enough to separate domains without creating sparse data.

**Stable map→session link via explicit FK.** `maps.session_id` is the definitive answer to "which resolution produced this map." No guessing via artifact_id + ORDER BY. The delete flow reads `session_id` directly, writes the `deleted` outcome event, then removes the map. The session row is immutable and survives the deletion.

**First-followup is unvalidated telemetry, not a ranking signal.** The classifier is unverified, the source comparison is unimplemented, and the client-side detection has systematic bias (positive signals underreported). We collect the data. We don't act on it. Activation requires: 200+ events, 70% classifier accuracy vs human labels, and ≥2x base-rate correlation with negative outcomes.

**Attempt-based learning is PxWeb-only.** This is a scope statement. Only PxWeb has a multi-table loop. Other sources produce sessions and outcomes but no attempt-level data. The infrastructure is general but we don't pretend it's activated where it isn't.

**The model is narrower than v2.1 but implementable.** Every table has one job. Every signal has a declared epistemological status (verified structural, verified behavioral, or unverified telemetry). The migration plan has explicit dependency ordering and feature flags. Nothing is presented as more complete than it actually is.
