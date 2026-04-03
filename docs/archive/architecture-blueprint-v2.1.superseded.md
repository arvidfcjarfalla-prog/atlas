> **Superseded by [architecture-blueprint-v3.md](../architecture-blueprint-v3.md).** This file is kept for historical reference only.

# Atlas Architecture Blueprint v2.1 — Revised RFC

> v2 revisions: attempt layer, consistent ledger, shared resolution engine.
> v2.1 revision: first follow-up signal as explicit learning mechanism.

---

## 1. Current System Model

### End-to-end flow

```
User prompt
  → POST /api/ai/clarify
    → clarify_cache check
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
    → data fetch + geometry join → data_cache
    → resolution-memory write (.next/cache — ephemeral)
    → clarify_cache + clarify_resolutions write
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

### The PxWeb attempt sequence (what v1 failed to model)

Inside `resolvePxWeb()`, each resolution is not a single decision — it's a loop:

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

Each iteration (a–e) can fail for a distinct reason:
- `no_geo_dimension` — table has no geographic dimension
- `no_data` — API returned empty
- `wrong_geo_level` — table has counties when user asked for municipalities
- `join_failed` — codes don't match geometry features
- `tabular_only` — data found but coverage too low for choropleth

**v1 did not capture these individual attempts.** The ledger only saw the final winning table or the best fallback. This means the system can never learn "table X consistently fails for join" or "table Y always gets tried first but always loses to table Z."

### Implicit domain objects

| Object | Exists where | Modeled explicitly? |
|---|---|---|
| **Map** | `maps` table | Yes — aggregate root |
| **MapVersion** | `map_versions` table | Yes — immutable snapshots |
| **Resolution session** | Single HTTP request in clarify | No — ephemeral |
| **Resolution attempt** | Loop iteration in `resolvePxWeb` | No — not persisted |
| **Dataset** | `data_cache` rows | Conflated with cache |
| **Generation record** | `case-memory` files | Ephemeral |
| **User outcome** | `case-memory.outcome` | Always "accepted" — never real |

### Where the model leaks

**Leak 1: Resolution attempts are invisible.** `resolvePxWeb` tries up to 5 tables. Only the winner is remembered (in ephemeral resolution-memory). Failed attempts are lost. The system can't learn "stop trying table X for this kind of prompt."

**Leak 2: Two separate resolution codepaths.** `clarify/route.ts` orchestrates the waterfall (PxWeb → DC → Eurostat → WB → web). `chat/route.ts` re-implements the same logic inside the `search_data` tool (PxWeb → Eurostat → WB → DC). Bug fixes in one don't propagate. Ranking/caching behaviors diverge silently.

**Leak 3: Data has split identity.** `data_cache` is both operational cache (TTL, expires) and the data backing saved maps (`geojson_url` points to cache). When the cache entry expires, saved maps get 404s.

**Leak 4: Learning is ephemeral.** `resolution-memory` and `case-memory` live in `.next/cache/`. Lost on every deploy.

**Leak 5: No negative signal.** `outcome` is always "accepted". No recording of abandonment, re-prompting, heavy editing, or deletion.

**Leak 6: Semantic correctness is unverifiable.** "Projected Births 2070" scored 100/100 for "befolkning per kommun" — structurally perfect, semantically wrong.

### Debt vs reasonable complexity

**Debt:** 3 tables without migrations, phantom `increment_clarify_hit`, `.next/cache` learning, `data_cache` as both cache and artifact.

**Reasonable:** clarify/generate-map split, deterministic fast path, per-country geography plugins, manifest compiler abstraction, quality scorer.

---

## 2. Core Problems

1. **Resolution attempts are invisible.** The system tries 1–5 tables per resolution but only remembers the winner. Failed attempts carry signal (which tables don't work for which prompts) that is currently discarded.

2. **Two resolution codepaths.** `clarify` and `chat` both implement data resolution with different orchestration. Bugs fixed in one diverge.

3. **Data has no stable identity.** `data_cache` is an operational cache with TTL. Saved maps reference cache entries that expire.

4. **Learning is ephemeral.** `.next/cache` stores are wiped on deploy.

5. **No negative feedback loop.** Outcome is always "accepted." The system cannot learn from failures.

6. **Semantic mismatch is undetectable.** Structural quality score cannot distinguish correct topic from wrong topic.

---

## 3. Target Domain Model

### Design choice: why attempt-level granularity, but not full event sourcing

**Full event sourcing** would model every state transition (metadata_fetched, geo_detected, join_planned, join_executed...) as immutable events. This is overkill for Atlas — we don't need to replay the join planner's decision tree. We need to know: which table was tried, what happened, and whether the final result was useful.

**A thin ledger without attempts** (v1's approach) can't answer: "Did table X fail because of join_failed or no_geo_dimension?" Without this, the system can't learn table-level failure patterns. It can only learn "this prompt eventually produced table Y" — not why table Y was chosen.

**The compromise:** Two-level model. A `resolution_session` captures the whole clarify request and its final outcome. `resolution_attempts` capture each table tried within that session — just the table ID, the status, and the failure reason. No intermediate state (metadata response, dimension selections, join diagnostics) is persisted — that detail stays in structured logs. The attempt level is the minimum needed for systematic learning.

### Domain objects

```
Map                         ← aggregate root (unchanged)
  ├── MapVersion            ← immutable snapshot (unchanged)
  ├── artifact_id → DatasetArtifact
  └── generation_id → GenerationRecord

DatasetArtifact             ← canonical, permanent data backing a map
  ├── geojson stored in Supabase Storage (permanent URL)
  ├── profile (DatasetProfile)
  ├── normalized_meta (dimensions, metrics, source metadata)
  ├── provenance (source_id, table_id, query params, fetch timestamp)
  └── status: 'map_ready' | 'tabular_only'

ResolutionSession           ← one clarify request
  ├── prompt, prompt_key
  ├── winning_artifact_id → DatasetArtifact (nullable — null if all attempts failed)
  ├── source_path: which source won (pxweb, eurostat, worldbank, overpass, ...)
  ├── outcome: pending | saved | edited | abandoned | deleted | stale
  ├── outcome_signals (jsonb — structured sub-signals, see below)
  ├── quality_score (0-100, structural)
  └── ResolutionAttempt[] (1-N)

ResolutionAttempt           ← one table tried within a session
  ├── session_id → ResolutionSession
  ├── ordinal (attempt order: 1, 2, 3...)
  ├── source_id ("pxweb-se-scb")
  ├── table_id ("BE0101A")
  ├── status: map_ready | tabular_only | no_geo | no_data | join_failed | wrong_level | unsupported
  ├── confidence (0.0-1.0)
  ├── coverage_ratio (0.0-1.0, nullable)
  ├── failure_reason (text, nullable — human-readable)
  └── latency_ms

GenerationRecord            ← how a manifest was produced
  ├── method: deterministic | ai | chat_edit
  ├── model, attempts, quality_score, token_usage, latency_ms
  └── manifest (jsonb)

ClarifyCache                ← operational speed cache (TTL, not canonical)
DataCache                   ← operational speed cache (TTL, not canonical)
```

### Object roles

| Role | Object | Persistence | TTL |
|---|---|---|---|
| Aggregate root | `maps` | Supabase Postgres | none |
| Canonical product data | `DatasetArtifact` | Postgres + Storage | none |
| Resolution process record | `ResolutionSession` | Postgres | none |
| Resolution attempt detail | `ResolutionAttempt` | Postgres | none |
| Generation audit trail | `GenerationRecord` | Postgres | none |
| Version history | `MapVersion` | Postgres | none |
| Operational cache | `ClarifyCache`, `DataCache` | Postgres | 1-24h |

---

## 4. Persistence Model

### New tables

```sql
-- Migration: 005_dataset_artifacts.sql

CREATE TABLE dataset_artifacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       text NOT NULL,                -- "pxweb-se-scb", "eurostat", "osm"
  table_id        text,                         -- PxWeb table ID (nullable for non-PxWeb)
  query_hash      text NOT NULL,                -- deterministic hash of fetch params
  geojson_url     text NOT NULL,                -- Supabase Storage permanent URL
  profile         jsonb NOT NULL,               -- DatasetProfile snapshot
  normalized_meta jsonb,                        -- dimensions, metrics, source metadata
  provenance      jsonb NOT NULL,               -- full fetch params for reproducibility
  status          text NOT NULL DEFAULT 'map_ready'
                    CHECK (status IN ('map_ready', 'tabular_only')),
  feature_count   int NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, query_hash)
);

CREATE INDEX idx_artifact_source ON dataset_artifacts (source_id, table_id);
```

```sql
-- Migration: 006_resolution_sessions.sql

-- Outcome taxonomy (exhaustive, closed set):
--   pending     — session created, user hasn't acted yet
--   saved       — user saved the resulting map
--   edited      — user saved but made significant edits (≥3 manifest changes)
--   abandoned   — user navigated away or re-prompted without saving
--   deleted     — user explicitly deleted the resulting map
--   stale       — map not accessed for 30+ days (set by background job)
--   failed      — all resolution attempts failed, no data returned

CREATE TABLE resolution_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key        text NOT NULL,
  prompt_original   text NOT NULL,
  source_path       text,                       -- winning source: "pxweb", "eurostat", "overpass", etc.
  artifact_id       uuid REFERENCES dataset_artifacts(id),
  map_id            uuid REFERENCES maps(id) ON DELETE SET NULL,
  outcome           text NOT NULL DEFAULT 'pending'
                      CHECK (outcome IN ('pending','saved','edited','abandoned','deleted','stale','failed')),
  outcome_signals   jsonb NOT NULL DEFAULT '{}'::jsonb,
                      -- Structured sub-signals:
                      -- {
                      --   "first_followup": "style_refinement",  -- classified first user action after generation
                      --                                           -- values: no_followup|view_refinement|style_refinement|
                      --                                           --          data_refinement|semantic_correction|restart
                      --   "first_followup_seconds": 14,          -- seconds from render to first action
                      --   "first_followup_tool": "update_manifest", -- tool called in first interaction (nullable)
                      --   "manifest_edit_count": 5,       -- total manifest changes via chat
                      --   "session_duration_s": 120,      -- time from clarify to last interaction
                      --   "user_score": null,              -- future: explicit 1-5 rating
                      --   "semantic_match": null,          -- future: did table label match prompt keywords?
                      --   "re_prompted": false,            -- did user re-prompt with different wording?
                      --   "deterministic": true            -- was generation deterministic (no AI)?
                      -- }
  quality_score     int,                        -- structural quality score 0-100
  keywords          text[] NOT NULL DEFAULT '{}',
  use_count         int NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_used_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_keywords ON resolution_sessions USING gin(keywords);
CREATE INDEX idx_session_outcome ON resolution_sessions (outcome);
CREATE INDEX idx_session_prompt ON resolution_sessions (prompt_key);
```

```sql
-- Migration: 007_resolution_attempts.sql

-- Attempt status taxonomy (exhaustive, closed set):
--   map_ready     — join succeeded, choropleth-renderable
--   tabular_only  — data found, but no viable geometry join
--   no_geo        — table has no geographic dimension
--   no_data       — API returned empty or zero records
--   join_failed   — geometry loaded but coverage too low (<20%)
--   wrong_level   — geographic level doesn't match user intent (county vs municipality)
--   unsupported   — metadata fetch failed or other unrecoverable error

CREATE TABLE resolution_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES resolution_sessions(id) ON DELETE CASCADE,
  ordinal         int NOT NULL,                 -- 1-based attempt order
  source_id       text NOT NULL,                -- "pxweb-se-scb"
  table_id        text,                         -- PxWeb table ID
  status          text NOT NULL
                    CHECK (status IN ('map_ready','tabular_only','no_geo','no_data','join_failed','wrong_level','unsupported')),
  confidence      real,                         -- 0.0-1.0
  coverage_ratio  real,                         -- 0.0-1.0, null if join not attempted
  failure_reason  text,                         -- human-readable, null on success
  latency_ms      int,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, ordinal)
);

CREATE INDEX idx_attempt_table ON resolution_attempts (source_id, table_id);
CREATE INDEX idx_attempt_status ON resolution_attempts (status);
```

```sql
-- Migration: 008_generation_records.sql

CREATE TABLE generation_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id          uuid REFERENCES maps(id) ON DELETE SET NULL,
  artifact_id     uuid REFERENCES dataset_artifacts(id),
  session_id      uuid REFERENCES resolution_sessions(id),
  method          text NOT NULL
                    CHECK (method IN ('deterministic', 'ai', 'chat_edit')),
  model           text,                         -- "sonnet-4.5", "opus-4.5", null
  attempts        int NOT NULL DEFAULT 1,       -- AI retry count
  quality_score   int,                          -- 0-100
  token_usage     jsonb,                        -- {inputTokens, outputTokens}
  latency_ms      int,
  manifest        jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

```sql
-- Migration: 009_maps_artifact_ref.sql

ALTER TABLE maps ADD COLUMN IF NOT EXISTS artifact_id uuid REFERENCES dataset_artifacts(id);
-- Backfill: existing maps keep artifact_id = null (use legacy geojson_url)
```

### Existing tables — disposition

| Table | Action | Detail |
|---|---|---|
| `maps` | **Keep + extend** | Add `artifact_id`. `geojson_url` stays for backward compat (deprecated, nullable). |
| `map_versions` | **Keep unchanged** | Immutable snapshots — working correctly. |
| `profiles` | **Keep unchanged** | Auth-linked user profiles. |
| `data_cache` | **Keep as operational cache** | Needs migration to formalize. TTL-based. Never canonical for saved maps. |
| `clarify_cache` | **Keep as operational cache** | Needs migration to formalize. TTL-based. |
| `clarify_resolutions` | **Replace** with `resolution_sessions` | Migrate existing rows (prompt_key, keywords, use_count). Drop after 30 days. |
| `resolution-memory` (.next/cache) | **Delete** | Replaced by `resolution_sessions` + `resolution_attempts` in Postgres. |
| `case-memory` (.next/cache) | **Delete** | Replaced by `generation_records` in Postgres. |

### Schema formalization (prerequisite)

Before new tables, create idempotent migrations for the three manual tables:

```
010_formalize_data_cache.sql      — CREATE TABLE IF NOT EXISTS data_cache (...)
011_formalize_clarify_cache.sql   — CREATE TABLE IF NOT EXISTS clarify_cache (...)
012_formalize_maps_table.sql      — CREATE TABLE IF NOT EXISTS maps (...)
```

**Exit criterion:** `supabase db reset` produces the complete schema from migrations alone.

---

## 5. Shared Resolution Engine

### The problem

Today, two codepaths resolve datasets:

1. **`clarify/route.ts`** — waterfall: catalog → overpass → PxWeb → DC → Eurostat → WB → web research → AI tools
2. **`chat/route.ts` `search_data` tool** — truncated version: PxWeb → Eurostat → WB → DC

They share some functions (`resolvePxWeb`, `searchEurostat`) but orchestrate them differently. The chat tool skips catalog, overpass, web research, agency hints, and the tabular stash pattern. Bug fixes and ranking improvements in one don't propagate.

### Target: `resolveDataset()` — one function, two callers

```typescript
// apps/web/lib/ai/tools/resolve-dataset.ts

interface ResolveDatasetInput {
  prompt: string;
  /** Restrict resolution to specific source types (e.g. chat tool only wants stats). */
  allowedPaths?: Set<'catalog' | 'overpass' | 'pxweb' | 'data_commons' | 'eurostat' | 'worldbank' | 'registry' | 'web_research'>;
  /** Skip AI-powered steps (for latency-sensitive contexts). */
  skipAiSteps?: boolean;
}

interface ResolveDatasetResult {
  status: 'resolved' | 'tabular_only' | 'agency_hint' | 'not_found';
  /** The winning artifact (when resolved or tabular_only). */
  artifact?: DatasetArtifact;
  /** The resolution session (always created). */
  session: ResolutionSession;
  /** ClarifyResponse-compatible shape for backward compat. */
  response: ClarifyResponse;
}

async function resolveDataset(input: ResolveDatasetInput): Promise<ResolveDatasetResult>
```

**Clarify route** calls `resolveDataset({ prompt, allowedPaths: all })` — full waterfall.

**Chat `search_data` tool** calls `resolveDataset({ prompt, allowedPaths: new Set(['pxweb', 'eurostat', 'worldbank', 'data_commons']) })` — stats only.

Both go through the same:
- Cache check
- Source waterfall (filtered by `allowedPaths`)
- PxWeb multi-table attempt loop
- Artifact creation
- Session + attempt writes
- Ledger ranking for candidate ordering

### Attempt recording inside `resolvePxWeb`

The existing `resolveOneTable()` function returns a `PxWebResolutionResult` with `status`, `confidence`, `reasons`, and `joinExecution.diagnostics.coverageRatio`. We instrument it to also return the information needed for an attempt record:

```typescript
// Inside the for-loop in resolvePxWeb():
for (let i = 0; i < attemptsLimit; i++) {
  const t0 = Date.now();
  const result = await resolveOneTable(source, orderedTables[i], ...);

  // Record attempt (fire-and-forget)
  attempts.push({
    ordinal: i + 1,
    source_id: source.id,
    table_id: orderedTables[i].id,
    status: mapResolutionStatusToAttemptStatus(result),
    confidence: result.confidence,
    coverage_ratio: result.joinExecution?.diagnostics?.coverageRatio ?? null,
    failure_reason: result.status !== 'map_ready' ? result.reasons.join('; ') : null,
    latency_ms: Date.now() - t0,
  });

  if (result.status === "map_ready") return { result, attempts };
  ...
}
```

The `resolveDataset()` wrapper writes the session and attempts to Postgres after the waterfall completes.

### Attempt-informed ranking

When building the candidate list for a new resolution, query past attempts:

```sql
-- Find tables that consistently fail for similar prompts
SELECT table_id, status, COUNT(*) as fail_count
FROM resolution_attempts ra
JOIN resolution_sessions rs ON ra.session_id = rs.id
WHERE ra.source_id = $1
  AND rs.keywords && $2            -- keyword overlap
  AND ra.status NOT IN ('map_ready')
GROUP BY table_id, status
HAVING COUNT(*) >= 3
ORDER BY fail_count DESC;
```

Tables with ≥3 failures for overlapping keywords are deprioritized in ranking. Tables with consistent `map_ready` are boosted (existing learned-tables logic, but persistent).

---

## 6. Runtime Flows

### Flow 1: New prompt, no cache hit

```
POST /api/ai/clarify
  → clarify_cache MISS
  → resolveDataset({ prompt, allowedPaths: all })
    → create ResolutionSession (outcome: 'pending')
    → waterfall:
      → PxWeb: resolvePxWeb() tries tables[0..4]
        → attempt 1: table BE0101A → no_geo → record attempt (status: no_geo)
        → attempt 2: table BE0101N → map_ready → record attempt (status: map_ready)
      → short-circuit: PxWeb won
    → create DatasetArtifact (geojson → Storage, profile, provenance)
    → update session: artifact_id, source_path='pxweb'
    → write all attempts to resolution_attempts
    → write to clarify_cache (operational, TTL)
    → return { artifact, session, response }
  → return ClarifyResponse

POST /api/ai/generate-map
  → load artifact by artifact_id (from response)
  → canGenerateDeterministic → yes → deterministic manifest
  → create GenerationRecord (method: deterministic, tokens: 0)
  → return manifest

POST /api/maps (save)
  → create map with artifact_id
  → update resolution_session: outcome='saved', map_id
```

### Flow 2: Prompt with cache hit

```
POST /api/ai/clarify
  → clarify_cache HIT
  → verify artifact still exists (Storage URL → HEAD request)
  → update session: use_count++, last_used_at
  → return cached response
```

### Flow 3: Wrong dataset first, correct dataset second (multi-table)

```
resolveDataset → resolvePxWeb:
  → attempt 1: table 11ra (568 mixed Alue codes)
    → join_failed (MK+KU mixed, coverage 0.12)
    → record attempt: {status: join_failed, coverage: 0.12, reason: "mixed admin levels"}
  → attempt 2: table 11rf (19 MK codes only)
    → map_ready (coverage 0.89)
    → record attempt: {status: map_ready, coverage: 0.89}
  → session: artifact from attempt 2

Future query with similar keywords:
  → query resolution_attempts: table 11ra has 3× join_failed for "maakunta" keywords
  → deprioritize 11ra, boost 11rf
  → attempt 1 is now 11rf → map_ready on first try
```

### Flow 4: Deterministic generation

```
POST /api/ai/generate-map
  → load artifact (has normalized_meta)
  → profile: Polygon + _atlas_value + ≥5 features
  → generateDeterministicManifest (sub-ms, zero tokens)
  → create GenerationRecord (method: 'deterministic', attempts: 0)
  → return
```

### Flow 5: AI generation

```
POST /api/ai/generate-map
  → load artifact
  → canGenerateDeterministic = false (point data)
  → Claude Sonnet loop (max 3 retries)
  → if quality < 60 → Opus fallback attempt
  → create GenerationRecord (method: 'ai', model: 'sonnet-4.5', attempts: 3)
  → return
```

### Flow 6: Edit via chat

```
POST /api/ai/chat (SSE)
  → tool: search_data
    → resolveDataset({ prompt, allowedPaths: stats-only })
    → same session/attempt/artifact path as clarify
    → returns {dataUrl, profile}
  → tool: update_manifest → validate → score
    → create GenerationRecord (method: 'chat_edit')
    → emit manifest-update SSE
  → client: autosave via PATCH /api/maps/{id}
```

### Flow 7: Autosave + version snapshot

```
Client detects manifest change (from chat edit or direct style edit)
  → PATCH /api/maps/{id} { manifest, chat_history }
  → if manifest differs from last saved:
    → POST /api/maps/{id}/versions (auto-snapshot)
```

### Flow 8: User abandons

```
Client detects: user navigates away within 30s of generation without saving
  → POST /api/ai/outcome { session_id, outcome: 'abandoned' }
  → UPDATE resolution_sessions SET outcome='abandoned',
      outcome_signals = outcome_signals || '{"re_prompted": false}'
```

### Flow 9: User re-prompts

```
Client detects: user submits new prompt from same page
  → POST /api/ai/outcome {
      session_id: previous_session,
      outcome: 'abandoned',
      signals: { re_prompted: true }
    }
  → New clarify request creates a new session
```

### Flow 10: User deletes map

```
DELETE /api/maps/{id}
  → ON DELETE SET NULL: generation_records.map_id → null, resolution_sessions.map_id → null
  → Background: UPDATE resolution_sessions SET outcome='deleted' WHERE map_id = $1
  → Artifact is NOT deleted (other maps may reference same artifact via query_hash dedup)
```

### Flow 11: Publish/share

```
PATCH /api/maps/{id} { is_public: true }
  → auto-generate slug
  → artifact's geojson_url points to Supabase Storage (permanent) → no 404
```

### Flow 12: First follow-up signal

```
Map renders in editor (new or loaded)
  → Client starts tracking timer (secondsToFirstAction)
  → Client stores initial manifest snapshot (for diffing)

User's first interaction:
  Case A: Chat message sent
    → classifyChatSkill(message) → skill
    → Wait for assistant response + tool calls
    → Diff manifest (if update_manifest called)
    → Check if search_data was called and compare source_id with original
    → classifyFirstFollowup({...}) → category

  Case B: User re-prompts (new clarify call from same page)
    → classifyFirstFollowup → 'restart'

  Case C: User saves/navigates away without interacting (>60s)
    → classifyFirstFollowup → 'no_followup'

  → POST /api/ai/outcome {
      session_id,
      signals: {
        first_followup: "semantic_correction",
        first_followup_seconds: 14,
        first_followup_tool: "search_data"
      }
    }
  → UPDATE resolution_sessions
    SET outcome_signals = outcome_signals || $signals
```

---

## 7. Learning Model

### Three concerns, cleanly separated

| Concern | Object | Mutability | Purpose |
|---|---|---|---|
| **Speed cache** | `clarify_cache`, `data_cache` | TTL-based, overwritten | Avoid re-fetching. Disposable. |
| **Audit trail** | `generation_records`, `map_versions`, `resolution_attempts` | Immutable (append-only) | What happened and why. |
| **Learning feedback** | `resolution_sessions.outcome` + `outcome_signals` + `first_followup` | Mutable (outcome updates) | Which resolutions work. |

### First follow-up signal

The user's first action after map generation is a stronger signal about the quality of the initial result than the eventual outcome (`saved`/`abandoned`/`deleted`). A user might save a map they had to completely re-data — the outcome is `saved` but the initial resolution was bad. Conversely, a user might abandon a perfectly resolved map because they lost interest — the outcome is `abandoned` but the resolution was fine.

The first follow-up tells you what was *wrong with the first attempt*, not just whether the user eventually kept it.

#### Taxonomy (exhaustive, closed set)

| Category | Meaning | Resolution signal | Generation signal |
|---|---|---|---|
| `no_followup` | User saves, shares, or leaves without any chat interaction | Resolution: good. Generation: good. | Strongest positive signal for both. |
| `view_refinement` | User adjusts zoom, center, pitch, bearing, bounds | Resolution: good. Generation: minor viewport miss. | Neutral for resolution, weak negative for generation (defaultZoom/defaultCenter were off). |
| `style_refinement` | User changes colors, scheme, family, opacity, legend, labels, classification | Resolution: good. Generation: style was wrong. | Neutral for resolution, moderate negative for generation (manifest design was off, not the data). |
| `data_refinement` | User changes time period, metric field, normalization, or asks for a different slice of the same source | Resolution: partially correct (right source, wrong slice). Generation: partially correct. | Weak negative for resolution (right table, wrong dimension selection). Moderate negative for generation. |
| `semantic_correction` | User says the topic/data is wrong, invokes `search_data` for a fundamentally different dataset, or changes `sourceUrl` | Resolution: wrong. | Strong negative for resolution (wrong table entirely). The winning table shouldn't be boosted. |
| `restart` | User re-prompts with different wording, navigates away within 60s, or clicks "Ny karta" | Resolution: likely wrong. Generation: likely wrong. | Strong negative for both, but weaker than `semantic_correction` because user intent is ambiguous (they might have changed their mind, not reacted to a bad result). |

#### How each category is detected

**`no_followup`** — Detected on the client. Timer starts when map renders. If the user saves (POST /api/maps), publishes, or navigates away after >60s without sending any chat message → `no_followup`. Also triggered if the only interaction is a direct style edit (sidebar slider/toggle) that doesn't go through chat.

**`view_refinement`** — Detected by diffing the manifest before and after the first `update_manifest` tool call. If only these fields changed: `defaultZoom`, `defaultCenter`, `defaultPitch`, `defaultBearing`, `defaultBounds` → `view_refinement`. Also detected from chat skill classification: `classifyChatSkill()` returns `"style"` and the message matches `/\b(zoom|pan|center|pitch|tilt|bearing|rotate|fit|bounds)\b/i`.

**`style_refinement`** — Detected by manifest diff OR chat skill. Manifest diff: changes to `style.color`, `style.classification`, `style.mapFamily`, `style.opacity`, `style.labelField`, `legend`, `style.clusterRadius`, `style.strokeWidth`, but NOT `sourceUrl`, `style.colorField` (when changed to a field from a *different* dataset), or `style.normalization.field`. Chat skill: `classifyChatSkill()` returns `"style"` and message doesn't match view keywords.

**`data_refinement`** — Detected by chat tool usage or manifest diff. The first chat message triggers `search_data` but for the *same source* (same `source_id`), or the manifest diff changes `style.colorField` to a different metric in the same dataset, or `style.normalization` changes, or the user asks for a different time period. Heuristic: if `search_data` is called and the returned `source_id` matches the original session's `source_id` → `data_refinement`.

**`semantic_correction`** — Detected by chat tool usage. The first chat message triggers `search_data` and the returned `source_id` OR `table_id` differs from the original session's winning attempt. Or the user explicitly says the data is wrong (keyword match: `/\b(wrong|fel|inte rätt|byt data|annan data|fel ämne|not what I asked)\b/i`). The distinguishing factor vs `data_refinement`: different source or different table, not just different slice.

**`restart`** — Detected on the client. User submits a new prompt from the same page (the `runPipeline` function is called again), or user navigates to `/app/map/new` within 60s. Or user presses browser back within 60s.

#### Detection implementation

The client already has the infrastructure:

1. `useAgentChat` tracks all messages and tool calls with `ToolCallInfo[]`
2. `classifyChatSkill()` classifies each message as `style | data | insight | general`
3. `manifest-update` SSE events carry the full new manifest (diffable)
4. `chat_history` is persisted on the map

The classifier runs on the client after the **first** user interaction post-generation:

```typescript
// apps/web/lib/ai/first-followup-classifier.ts

type FirstFollowup =
  | 'no_followup'
  | 'view_refinement'
  | 'style_refinement'
  | 'data_refinement'
  | 'semantic_correction'
  | 'restart';

interface ClassifyInput {
  /** Time in seconds from map render to first interaction. */
  secondsToFirstAction: number;
  /** Was the first interaction a chat message? */
  firstChatMessage: string | null;
  /** Chat skill classification of first message. */
  firstChatSkill: ChatSkill | null;
  /** Tool calls in first assistant response. */
  firstToolCalls: ToolCallInfo[];
  /** Manifest diff: which top-level paths changed. */
  manifestChangedPaths: Set<string>;
  /** Did search_data return a different source_id than the original? */
  searchReturnedDifferentSource: boolean;
  /** Did the user re-prompt (new clarify call)? */
  rePrompted: boolean;
}

function classifyFirstFollowup(input: ClassifyInput): FirstFollowup {
  // Restart: re-prompted or navigated away fast
  if (input.rePrompted) return 'restart';

  // No followup: no chat message within tracking window
  if (!input.firstChatMessage) return 'no_followup';

  // Semantic correction: search_data called → different source/table
  if (input.searchReturnedDifferentSource) return 'semantic_correction';

  // Check for explicit "wrong data" keywords
  if (/\b(wrong|fel|inte rätt|byt data|annan data|fel ämne)\b/i.test(input.firstChatMessage)) {
    return 'semantic_correction';
  }

  // Data refinement: search_data called → same source
  const calledSearchData = input.firstToolCalls.some(t => t.toolName === 'search_data');
  if (calledSearchData && !input.searchReturnedDifferentSource) {
    return 'data_refinement';
  }

  // Data refinement: colorField or sourceUrl changed
  if (input.manifestChangedPaths.has('sourceUrl') ||
      input.manifestChangedPaths.has('colorField_different_dataset')) {
    return 'data_refinement';
  }

  // View refinement: only viewport fields changed
  const VIEW_PATHS = new Set(['defaultZoom','defaultCenter','defaultPitch','defaultBearing','defaultBounds']);
  if (input.manifestChangedPaths.size > 0 &&
      [...input.manifestChangedPaths].every(p => VIEW_PATHS.has(p))) {
    return 'view_refinement';
  }

  // Style refinement: style-classified message or style-only manifest changes
  if (input.firstChatSkill === 'style') return 'style_refinement';

  // Default: if manifest changed but doesn't fit above → style_refinement
  if (input.manifestChangedPaths.size > 0) return 'style_refinement';

  // Insight question or general message → no_followup equivalent (not corrective)
  return 'no_followup';
}
```

#### Storage: part of `outcome_signals`, not a separate table

The first follow-up is a single classification per resolution session — one scalar value. It belongs in `outcome_signals` alongside the other sub-signals:

```jsonc
{
  "first_followup": "style_refinement",     // the classified first action
  "first_followup_seconds": 14,             // seconds from render to first action
  "first_followup_tool": "update_manifest", // which tool was called (null if no tool)
  "manifest_edit_count": 5,
  "session_duration_s": 120,
  "user_score": null,
  "semantic_match": null,
  "re_prompted": false,
  "deterministic": true
}
```

Why not a separate table: one row per session, one classification. Adding a table for a single scalar on an existing row is over-modeling. The JSONB column handles it without schema changes.

#### How first_followup affects learning

The first follow-up directly modulates the resolution and generation boost/penalty, orthogonal to the coarser `outcome`:

**For resolution ranking:**

| first_followup | Resolution boost/penalty | Reasoning |
|---|---|---|
| `no_followup` | +2 | Data was right — no correction needed |
| `view_refinement` | +1.5 | Data was right — only viewport was off |
| `style_refinement` | +1 | Data was right — generation styled it wrong, not a resolution problem |
| `data_refinement` | -1 | Right source, wrong slice — resolution was close but imprecise |
| `semantic_correction` | -4 | Wrong data entirely — resolution failed its primary job |
| `restart` | -2 | Ambiguous but likely bad — user didn't even try to fix it |

**For generation quality scoring (future: improve deterministic/AI generation):**

| first_followup | Generation signal | Reasoning |
|---|---|---|
| `no_followup` | +2 | Manifest was good enough to use as-is |
| `view_refinement` | -0.5 | Minor: defaultZoom/Center were off |
| `style_refinement` | -1.5 | Moderate: colors/family/classification were wrong |
| `data_refinement` | -1 | Moderate: generation picked wrong metric/time |
| `semantic_correction` | 0 | Not generation's fault — it worked with wrong data |
| `restart` | -1 | Ambiguous |

**Key insight: `semantic_correction` penalizes resolution but not generation.** If the AI got the wrong table but generated a beautiful choropleth from it, generation did its job. The bug was upstream.

#### How this differs from `outcome` alone

Consider three scenarios:

**Scenario A:** User gets "Projected Births 2070" for "befolkning per kommun". They say "fel data, visa befolkning" in chat. AI finds the correct table. User saves.
- `outcome`: `saved` (eventually positive)
- `first_followup`: `semantic_correction` (immediately negative for resolution)
- **Without first_followup:** the resolution that produced "Projected Births" gets +3 boost (saved). **With first_followup:** it gets +3 (saved) - 4 (semantic_correction) = **-1 net**. The system learns the first resolution was wrong.

**Scenario B:** User gets a correct population choropleth but in ugly gray colors. They say "byt till blått". Save.
- `outcome`: `saved`
- `first_followup`: `style_refinement`
- **Effect:** Resolution gets +3 (saved) + 1 (style_refinement) = **+4**. The data was right. Only generation needs improvement.

**Scenario C:** User gets a correct map, glances at it for 5 seconds, closes the tab.
- `outcome`: `abandoned`
- `first_followup`: `no_followup` (never interacted)
- **Effect:** Resolution gets -2 (abandoned) + 2 (no_followup) = **0 net**. Ambiguous — the data might have been fine, the user just left. Without first_followup, this would be -2 (pure negative).

The first follow-up disambiguates what `saved` and `abandoned` cannot: *was the initial result right?*

### How learning drives future resolution ranking

```python
# Pseudocode: building the candidate list for a new PxWeb resolution

def rank_candidates(source_id, prompt_keywords, raw_ranked_tables):
    # 1. Load session-level signals for winning tables
    sessions = query("""
        SELECT ra.table_id,
               rs.outcome,
               rs.outcome_signals->>'first_followup' as first_followup,
               COUNT(*) as count
        FROM resolution_attempts ra
        JOIN resolution_sessions rs ON ra.session_id = rs.id
        WHERE ra.source_id = :source_id
          AND ra.status = 'map_ready'
          AND rs.keywords && :keywords
        GROUP BY ra.table_id, rs.outcome, first_followup
    """)

    # 2. Load attempt-level failures
    failures = query("""
        SELECT ra.table_id, ra.status, COUNT(*) as fail_count
        FROM resolution_attempts ra
        JOIN resolution_sessions rs ON ra.session_id = rs.id
        WHERE ra.source_id = :source_id
          AND ra.status NOT IN ('map_ready')
          AND rs.keywords && :keywords
        GROUP BY ra.table_id, ra.status
        HAVING COUNT(*) >= 2
    """)

    for table in raw_ranked_tables:
        score = table.base_rank_score

        # Outcome signal (coarse)
        OUTCOME_WEIGHTS = {
            'saved': +3, 'edited': +1, 'abandoned': -2,
            'deleted': -3, 'stale': -0.5, 'pending': 0
        }
        for (outcome, count) in sessions[table.id].by_outcome:
            score += OUTCOME_WEIGHTS[outcome] * count

        # First-followup signal (fine-grained, applied to resolution)
        FOLLOWUP_WEIGHTS = {
            'no_followup': +2, 'view_refinement': +1.5,
            'style_refinement': +1, 'data_refinement': -1,
            'semantic_correction': -4, 'restart': -2
        }
        for (followup, count) in sessions[table.id].by_followup:
            score += FOLLOWUP_WEIGHTS.get(followup, 0) * count

        # Attempt-level failures (structural)
        FAILURE_WEIGHTS = {
            'join_failed': -5, 'no_geo': -4,
            'wrong_level': -2, 'tabular_only': -1
        }
        for (status, count) in failures[table.id]:
            score += FAILURE_WEIGHTS.get(status, 0) * count

    return sorted(raw_ranked_tables, key=lambda t: -t.score)
```

### User outcome > model score

The ranking uses three signal layers, from strongest to weakest:

1. **First follow-up** — immediate reaction to initial result (strongest per-event weight)
2. **Session outcome** — final disposition (saved/abandoned/deleted)
3. **Attempt status** — structural failures (join_failed, no_geo)
4. **Structural quality score** — tiebreaker only

### Semantic correctness

Three defenses, progressive:

**Short-term (Phase 2):** Outcome + first_followup accumulation. If users consistently trigger `semantic_correction` for table X with keyword set Y, the resolution score craters regardless of structural quality.

**Medium-term (Phase 3):** Lightweight semantic gate in `resolveDataset()`. After PxWeb selects a table, compare the table's label + metric labels against the prompt's keywords. If overlap < threshold, present a confirmation question: "Vi hittade [table label]. Stämmer det?" before generating.

**Long-term:** Correlate `first_followup` type with manifest diff patterns to build a classifier that predicts semantic mismatch *before* the user sees the map. If the system learns that "befolkning" + table "BE0401" (births) always triggers `semantic_correction`, it can flag this proactively.

---

## 8. Migration Plan

### Phase 0: Schema formalization (zero risk)

Create idempotent migrations for manually-created tables.

**Files:** 010–012 migrations.
**Exit criterion:** `supabase db reset` produces complete schema from migrations alone.

### Phase 1: DatasetArtifact + Supabase Storage (low risk)

Add `dataset_artifacts` table. Create `artifacts` Storage bucket. Modify `resolveOneTable()` to write artifacts for map_ready results. Maps still use `geojson_url` — artifact_id written but not consumed yet.

**Files:** migration 005, `pxweb-resolution.ts`, `data-search.ts`, Supabase Storage config.
**Exit criterion:** Every new map_ready resolution writes an artifact row. `geojson_url` still works. No behavior change for users.

### Phase 2: Resolution sessions + attempts (medium risk)

Add `resolution_sessions` and `resolution_attempts` tables. Create `resolveDataset()` shared function. Refactor `clarify/route.ts` to call `resolveDataset()`. Refactor `chat/route.ts` `search_data` tool to call `resolveDataset()`. Wire session/attempt writes. Instrument `resolvePxWeb()` to return attempt records.

**Files:** migrations 006-007, new `resolve-dataset.ts`, refactored `clarify/route.ts`, refactored `chat/route.ts`.
**Exit criterion:** Both clarify and chat produce session+attempt records in Postgres. `resolution-memory.json` is no longer read. Ranking uses ledger data. Verified: same prompt produces same result as before (regression test).

### Phase 3: Generation records + outcome tracking + first follow-up (medium risk)

Add `generation_records` table. Replace `case-memory.ts` filesystem writes with DB writes. Add `POST /api/ai/outcome` endpoint. Client reports abandonment, re-prompting, deletion. Implement `classifyFirstFollowup()` on the client. Client sends the classified first follow-up to the outcome endpoint after the first user interaction post-generation. Add semantic gate (table label vs. prompt keyword check).

**Files:**
- migration 008
- refactored `case-memory.ts`
- new `api/ai/outcome/route.ts`
- new `lib/ai/first-followup-classifier.ts`
- `app/(editor)/map/new/page.tsx` — track first interaction, classify, report
- `app/(editor)/map/[id]/page.tsx` — track first interaction in editor, classify, report
- `lib/hooks/use-agent-chat.ts` — expose first tool call info for classifier

**Exit criteria:**
- `.next/cache/atlas-cases/` no longer written
- Generation records persist across deploys
- Outcome column shows varied values (not all "pending")
- `first_followup` appears in `outcome_signals` for >80% of sessions where user interacts
- Verified: `semantic_correction` is recorded when user explicitly changes data source in chat

### Phase 4: Maps → artifact_id switchover (medium risk)

Add `artifact_id` to maps. On save, write artifact_id. On load, prefer artifact → Storage URL over `geojson_url`. Fallback to `geojson_url` for legacy maps.

**Files:** migration 009, `POST /api/maps`, `GET /api/maps/{id}`, `load-public-map.ts`.
**Exit criterion:** New maps always have artifact_id. Legacy maps load via geojson_url. No 404s for any map.

### Phase 5: Learning activation

Enable three-layer ranking in `resolveDataset()`:
1. **First follow-up weights** — query `outcome_signals->>'first_followup'` from `resolution_sessions`
2. **Outcome weights** — query `outcome` from `resolution_sessions`
3. **Attempt failure weights** — query `status` from `resolution_attempts`

Measure with instrumented A/B: old ranking (keyword overlap only) vs new ranking (three-layer). Metrics: first-attempt success rate, mean attempts-to-map_ready, semantic_correction rate.

**Files:** `resolve-dataset.ts` ranking logic, instrumented logging for A/B comparison.
**Exit criteria:**
- Repeated "befolkning per kommun" resolves correct table on first attempt (not second+)
- Tables with 3+ `join_failed` outcomes are deprioritized
- Tables with 2+ `semantic_correction` followups are deprioritized even if outcome was `saved`
- First-attempt success rate ≥10% higher than baseline (measured over 100+ sessions)

### Phase 6: Cleanup

- Delete `resolution-memory.ts`
- Delete filesystem logic in `case-memory.ts` (keep interface, backed by DB)
- Deprecate `geojson_url` on maps (documentation only)
- Drop `clarify_resolutions` table (30 days after Phase 2)
- Remove `increment_clarify_hit` from types.ts

**Exit criterion:** No `.next/cache` learning files. All persistence in Supabase Postgres + Storage.

---

## 9. Guardrails

1. **No new `.next/cache` learning stores.** All learning writes go to Postgres.
2. **No new tables without a migration file.** `supabase db reset` must produce the complete schema.
3. **No dashboard-only tables.** If it's in types.ts, it must be in a migration.
4. **Cache is never truth.** `data_cache` and `clarify_cache` are operational speed layers. `dataset_artifacts` is canonical. Saved maps reference artifacts, not cache.
5. **Every new table has RLS from day one.**
6. **Outcome and first_followup writes are fire-and-forget.** Never block user experience. If the POST to /api/ai/outcome fails, the map still works.
7. **Attempt records are append-only.** Never mutated after creation.
8. **Outcome enum is closed.** New sub-signals go in `outcome_signals` JSONB, not new enum values.
9. **The model is replayable.** Given a session + its attempts + the generation record, you can reconstruct: what prompt, which tables were tried, why each failed or succeeded, what data was produced, what manifest was generated, and whether the user kept it.

---

## 10. Final Recommendation

**`maps` stays as aggregate root.** Users think in maps. Every other object exists to produce or improve a map.

**`DatasetArtifact` is the most important new building block.** It separates canonical data (permanent, Storage-backed) from operational cache (TTL, disposable). This eliminates the 404-on-saved-maps bug by construction.

**`ResolutionSession` + `ResolutionAttempt` is the minimum viable process model.** Not full event sourcing (too heavy — Atlas doesn't need to replay join planner state transitions). Not a flat ledger (too thin — can't learn which tables fail). Two levels: the session captures the whole request and its outcome; the attempts capture each table tried and why it succeeded or failed. This is the granularity needed for systematic learning.

**`resolveDataset()` as shared resolution engine is non-negotiable.** Two codepaths resolving data differently is the source of divergent bugs. One function, two callers (clarify as full waterfall, chat as stats-only subset). Same ranking, same caching, same artifact creation, same session/attempt recording.

**First follow-up is the most valuable new signal.** `outcome` (saved/abandoned) is too coarse — it conflates "data was wrong but user fixed it" with "data was right." The first follow-up classifies the user's immediate reaction: was the data right (style_refinement, view_refinement, no_followup) or wrong (semantic_correction, data_refinement, restart)? This lets the ranking algorithm distinguish "the table was correct but the presentation was off" from "the table was wrong." It's a client-side classifier — zero server cost, zero latency impact, high signal value.

**Phased migration, each phase independently valuable.** Phase 0 (schema formalization) is pure debt cleanup. Phase 1 (artifacts) fixes the 404 bug. Phase 2 (sessions + attempts + shared engine) fixes the duplicate codepath problem and starts accumulating learning data. Phase 3 (outcomes + first follow-up) closes the feedback loop with fine-grained signal. Phase 4 (switchover) connects artifacts to maps. Phase 5 (ranking) activates three-layer learning. Phase 6 (cleanup) removes the old system. Any phase can be the stopping point, and the system works — just with less capability.
