/**
 * Durable dataset storage.
 *
 * Writes GeoJSON blobs to Supabase Storage and creates/reuses
 * dataset_artifacts rows as the canonical durable record.
 *
 * maps.artifact_id → dataset_artifacts.id is the source of truth.
 * /api/geo/cached/* remains a cache — no durability guarantees.
 *
 * Access model:
 * - Public artifacts (is_public=true): readable by anyone, dedup globally by content_hash
 * - Private artifacts (is_public=false): readable only by owner_user_id, dedup per-owner
 */

import { createHash } from "crypto";
import { getServiceClient } from "../../supabase/service";
import type { CacheEntry, NormalizedMeta } from "./data-search";
import type { Json } from "../../supabase/types";
import { log } from "../../logger";

const BUCKET = "datasets";

// ─── Content hash ──────────────────────────────────────────

/**
 * Order-independent hash of GeoJSON features.
 * Identical to artifact.ts computeContentHash — shared logic.
 */
function computeContentHash(features: GeoJSON.Feature[]): string {
  const canonical = features
    .map((f) => ({
      code: f.properties?._atlas_code ?? f.properties?.scb_code ?? "",
      value: f.properties?._atlas_value ?? null,
      metric: f.properties?._atlas_metric_label ?? "",
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const input = JSON.stringify({ n: features.length, f: canonical });
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

// ─── Helpers ───────────────────────────────────────────────

/**
 * Next version for a (source_id, query_fingerprint) pair.
 * Not atomic — concurrent callers may compute the same version.
 * The UNIQUE(source_id, query_fingerprint, version) constraint catches this,
 * and the 23505 handler in callers recovers via content_hash re-query.
 */
async function nextVersion(
  client: NonNullable<ReturnType<typeof getServiceClient>>,
  sourceId: string,
  queryFingerprint: string,
): Promise<number> {
  const { data } = await client
    .from("dataset_artifacts")
    .select("version")
    .eq("source_id", sourceId)
    .eq("query_fingerprint", queryFingerprint)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.version ?? 0) + 1;
}

// ─── Ensure durable dataset ────────────────────────────────

export interface EnsureDurableParams {
  /** Cache key from geojson_url (e.g. "pxweb-se-scb:TAB638:municipality") */
  cacheKey: string;
  /** The full cache entry with data, profile, normalizedMeta */
  entry: CacheEntry;
  /** Optional source identifier (e.g. "pxweb-se-scb") */
  sourceId?: string;
  /** User who triggered the save */
  userId?: string;
  /** Whether the artifact should be public (default: true for backward compat) */
  isPublic?: boolean;
}

/**
 * Ensure a durable dataset artifact exists for the given cache entry.
 *
 * Public artifacts: dedup globally by content_hash within public pool.
 * Private artifacts: dedup per-owner by content_hash.
 *
 * Returns artifact ID, or null on failure.
 */
export async function ensureDurableDataset(
  params: EnsureDurableParams,
): Promise<string | null> {
  const client = getServiceClient();
  if (!client) {
    log("dataset-storage.no-client", { cacheKey: params.cacheKey });
    return null;
  }

  const isPublic = params.isPublic ?? true;

  try {
    const features = params.entry.data?.features;
    if (!features?.length) return null;

    const contentHash = computeContentHash(features);
    const storagePath = `${contentHash}.geojson`;
    const sourceId = params.sourceId ?? params.entry.source ?? "unknown";
    const queryFingerprint = createHash("sha256")
      .update(params.cacheKey)
      .digest("hex")
      .slice(0, 16);

    // ── Dedup check ──────────────────────────────────────
    if (isPublic) {
      const { data: existing } = await client
        .from("dataset_artifacts")
        .select("id")
        .eq("content_hash", contentHash)
        .eq("is_public", true)
        .not("storage_path", "is", null)
        .limit(1)
        .maybeSingle();
      if (existing) return existing.id;
    } else {
      if (!params.userId) {
        log("dataset-storage.private-no-user", { cacheKey: params.cacheKey });
        return null;
      }
      const { data: existing } = await client
        .from("dataset_artifacts")
        .select("id")
        .eq("content_hash", contentHash)
        .eq("is_public", false)
        .eq("owner_user_id", params.userId)
        .not("storage_path", "is", null)
        .limit(1)
        .maybeSingle();
      if (existing) return existing.id;
    }

    // ── Legacy upgrade (public path only) ────────────────
    let legacyArtifact: { id: string } | null = null;
    if (isPublic) {
      const { data } = await client
        .from("dataset_artifacts")
        .select("id")
        .eq("content_hash", contentHash)
        .eq("is_public", true)
        .is("storage_path", null)
        .limit(1)
        .maybeSingle();
      legacyArtifact = data;
    }

    // ── Upload blob (idempotent — same path = same content)
    const blob = JSON.stringify(params.entry.data);
    const { error: uploadError } = await client.storage
      .from(BUCKET)
      .upload(storagePath, blob, {
        contentType: "application/geo+json",
        upsert: true,
      });

    if (uploadError) {
      log("dataset-storage.upload-error", {
        cacheKey: params.cacheKey,
        error: uploadError.message,
      });
      return null;
    }

    // ── Upgrade legacy artifact if found ─────────────────
    if (legacyArtifact) {
      const { error: upgradeError } = await client
        .from("dataset_artifacts")
        .update({
          storage_bucket: BUCKET,
          storage_path: storagePath,
          owner_user_id: params.userId ?? null,
        })
        .eq("id", legacyArtifact.id);

      if (!upgradeError) return legacyArtifact.id;
      log("dataset-storage.upgrade-error", {
        artifactId: legacyArtifact.id,
        error: upgradeError.message,
      });
    }

    // ── Build normalized_meta ────────────────────────────
    const normalizedMeta = params.entry.normalizedMeta
      ? {
          sourceMetadata: params.entry.normalizedMeta.sourceMetadata,
          dimensions: params.entry.normalizedMeta.dimensions,
          candidateMetricFields:
            params.entry.normalizedMeta.candidateMetricFields,
        }
      : null;

    // ── Insert new artifact ──────────────────────────────
    const version = await nextVersion(client, sourceId, queryFingerprint);

    const { data: inserted, error: insertError } = await client
      .from("dataset_artifacts")
      .insert({
        source_id: sourceId,
        query_fingerprint: queryFingerprint,
        version,
        geojson_url: null,
        profile: params.entry.profile as unknown as Json,
        normalized_meta: normalizedMeta as unknown as Json,
        provenance: {
          cacheKey: params.cacheKey,
          source: params.entry.source,
          description: params.entry.description,
          storedAt: Date.now(),
        } as unknown as Json,
        status: params.entry.resolutionStatus ?? "map_ready",
        feature_count: features.length,
        content_hash: contentHash,
        storage_bucket: BUCKET,
        storage_path: storagePath,
        owner_user_id: params.userId ?? null,
        is_public: isPublic,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      if (insertError?.code === "23505") {
        // Race condition — re-query matching artifact for our privacy level
        let raceQuery = client
          .from("dataset_artifacts")
          .select("id")
          .eq("content_hash", contentHash)
          .not("storage_path", "is", null);

        if (isPublic) {
          raceQuery = raceQuery.eq("is_public", true);
        } else {
          raceQuery = raceQuery
            .eq("is_public", false)
            .eq("owner_user_id", params.userId!);
        }

        const { data: raced } = await raceQuery.limit(1).maybeSingle();
        if (raced) return raced.id;
      }
      log("dataset-storage.insert-error", {
        cacheKey: params.cacheKey,
        error: insertError?.message,
      });
      return null;
    }

    return inserted.id;
  } catch (err) {
    log("dataset-storage.error", {
      cacheKey: params.cacheKey,
      error: err instanceof Error ? err.message : "unknown",
    });
    return null;
  }
}

// ─── Promote artifact to public ───────────────────────────

/**
 * Ensure a map's artifact is public. Used when toggling private → public.
 *
 * 1. Already public → return same ID (no-op)
 * 2. Public artifact with same content_hash exists → return that ID (rebind)
 * 3. Otherwise → create new public artifact from same storage blob
 *
 * Returns the (possibly new) public artifact ID, or null on failure.
 */
export async function promoteArtifactToPublic(
  artifactId: string,
  userId: string,
): Promise<string | null> {
  const client = getServiceClient();
  if (!client) return null;

  try {
    const { data: artifact, error } = await client
      .from("dataset_artifacts")
      .select(
        "id, source_id, query_fingerprint, profile, normalized_meta, provenance, status, feature_count, content_hash, storage_bucket, storage_path, owner_user_id, is_public",
      )
      .eq("id", artifactId)
      .single();

    if (error || !artifact) return null;

    // Already public
    if (artifact.is_public) return artifact.id;

    // Ownership check
    if (artifact.owner_user_id !== userId) return null;

    // Reuse existing public artifact with same content
    const { data: publicMatch } = await client
      .from("dataset_artifacts")
      .select("id")
      .eq("content_hash", artifact.content_hash)
      .eq("is_public", true)
      .not("storage_path", "is", null)
      .limit(1)
      .maybeSingle();

    if (publicMatch) return publicMatch.id;

    // Create new public artifact from same storage blob
    const version = await nextVersion(
      client,
      artifact.source_id,
      artifact.query_fingerprint,
    );

    const { data: promoted, error: insertError } = await client
      .from("dataset_artifacts")
      .insert({
        source_id: artifact.source_id,
        query_fingerprint: artifact.query_fingerprint,
        version,
        geojson_url: null,
        profile: artifact.profile,
        normalized_meta: artifact.normalized_meta,
        provenance: artifact.provenance,
        status: artifact.status as "map_ready" | "tabular_only",
        feature_count: artifact.feature_count,
        content_hash: artifact.content_hash,
        storage_bucket: artifact.storage_bucket ?? BUCKET,
        storage_path: artifact.storage_path,
        owner_user_id: userId,
        is_public: true,
      })
      .select("id")
      .single();

    if (insertError || !promoted) {
      if (insertError?.code === "23505") {
        const { data: raced } = await client
          .from("dataset_artifacts")
          .select("id")
          .eq("content_hash", artifact.content_hash)
          .eq("is_public", true)
          .not("storage_path", "is", null)
          .limit(1)
          .maybeSingle();
        if (raced) return raced.id;
      }
      log("dataset-storage.promote-error", {
        artifactId,
        error: insertError?.message,
      });
      return null;
    }

    return promoted.id;
  } catch (err) {
    log("dataset-storage.promote-error", {
      artifactId,
      error: err instanceof Error ? err.message : "unknown",
    });
    return null;
  }
}

// ─── Read durable dataset ──────────────────────────────────

/**
 * Read a GeoJSON FeatureCollection from durable storage by artifact ID.
 *
 * Access model:
 * - Public artifacts: readable by anyone (no userId required)
 * - Private artifacts: readable only when opts.userId matches owner_user_id
 */
export async function readDurableDataset(
  artifactId: string,
  opts?: { userId?: string },
): Promise<GeoJSON.FeatureCollection | null> {
  const client = getServiceClient();
  if (!client) return null;

  try {
    const { data: artifact, error } = await client
      .from("dataset_artifacts")
      .select("storage_bucket, storage_path, is_public, owner_user_id")
      .eq("id", artifactId)
      .not("storage_path", "is", null)
      .single();

    if (error || !artifact?.storage_path) return null;

    // Access check: private artifacts require matching owner
    if (!artifact.is_public) {
      if (!opts?.userId || artifact.owner_user_id !== opts.userId) {
        return null;
      }
    }

    const { data: blob, error: downloadError } = await client.storage
      .from(artifact.storage_bucket ?? BUCKET)
      .download(artifact.storage_path);

    if (downloadError || !blob) return null;

    const text = await blob.text();
    const parsed = JSON.parse(text);
    if (
      parsed?.type === "FeatureCollection" &&
      Array.isArray(parsed.features)
    ) {
      return parsed as GeoJSON.FeatureCollection;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Read artifact metadata ──────────────────────────────────

/**
 * Read normalized_meta from an artifact row (no storage download).
 *
 * Access model matches readDurableDataset:
 * - Public artifacts: readable by anyone
 * - Private artifacts: require matching userId
 */
export async function readArtifactMeta(
  artifactId: string,
  opts?: { userId?: string },
): Promise<NormalizedMeta | null> {
  const client = getServiceClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("dataset_artifacts")
      .select("normalized_meta, is_public, owner_user_id")
      .eq("id", artifactId)
      .single();

    if (error || !data?.normalized_meta) return null;

    if (!data.is_public) {
      if (!opts?.userId || data.owner_user_id !== opts.userId) {
        return null;
      }
    }

    return data.normalized_meta as unknown as NormalizedMeta;
  } catch {
    return null;
  }
}
