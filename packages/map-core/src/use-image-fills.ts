"use client";

import { useEffect, useRef } from "react";
import { useMap } from "./use-map";

interface ImageFillMetadata {
  imageField: string;
  imageMap: Record<string, string>;
  fallbackUrl?: string;
  opacity: number;
  resolution: number;
}

const MAX_CONCURRENT = 6;

/**
 * Load an image from URL and scale it to the target resolution
 * using an offscreen canvas. Returns an ImageData suitable for
 * map.addImage().
 */
async function loadImage(
  url: string,
  resolution: number,
): Promise<{ width: number; height: number; data: Uint8ClampedArray } | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });

    const canvas = new OffscreenCanvas(resolution, resolution);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, resolution, resolution);
    const imageData = ctx.getImageData(0, 0, resolution, resolution);
    return {
      width: resolution,
      height: resolution,
      data: imageData.data,
    };
  } catch {
    return null;
  }
}

/**
 * Load images with concurrency limit.
 */
async function loadImagesParallel(
  entries: Array<{ key: string; url: string }>,
  resolution: number,
  concurrency = MAX_CONCURRENT,
): Promise<Map<string, { width: number; height: number; data: Uint8ClampedArray }>> {
  const results = new Map<string, { width: number; height: number; data: Uint8ClampedArray }>();
  const queue = [...entries];

  async function worker() {
    while (queue.length > 0) {
      const entry = queue.shift();
      if (!entry) break;
      const img = await loadImage(entry.url, resolution);
      if (img) results.set(entry.key, img);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Hook that loads images and applies fill-pattern to polygon features.
 *
 * Reads _imageFill metadata from the compiled layer and:
 * 1. Loads images in parallel (concurrency 6)
 * 2. Scales them to resolution x resolution via offscreen canvas
 * 3. Calls map.addImage() per image
 * 4. Sets fill-pattern as a match expression on the fill layer
 *
 * @param layerId - The base layer ID prefix.
 * @param imageFill - Image fill metadata from compiled layer.
 */
export function useImageFills(
  layerId: string | undefined,
  imageFill: ImageFillMetadata | null | undefined,
): void {
  const { map, isReady } = useMap();
  const addedImagesRef = useRef<string[]>([]);

  useEffect(() => {
    if (!map || !isReady || !imageFill || !layerId) return;
    if (Object.keys(imageFill.imageMap).length === 0) return;

    let cancelled = false;

    async function applyImageFills() {
      if (!map || !imageFill) return;

      const entries = Object.entries(imageFill.imageMap).map(([key, url]) => ({
        key,
        url,
        imageId: `img-${layerId}-${key.replace(/[^a-zA-Z0-9]/g, "_")}`,
      }));

      const imageResults = await loadImagesParallel(
        entries.map((e) => ({ key: e.imageId, url: e.url })),
        imageFill.resolution,
      );

      if (cancelled) return;

      // Add images to map
      const addedIds: string[] = [];
      for (const entry of entries) {
        const imgData = imageResults.get(entry.imageId);
        if (!imgData) continue;
        if (!map.hasImage(entry.imageId)) {
          map.addImage(entry.imageId, imgData);
          addedIds.push(entry.imageId);
        }
      }
      addedImagesRef.current = addedIds;

      // Build fill-pattern match expression
      const fillLayerId = `${layerId}-fill`;
      if (!map.getLayer(fillLayerId)) return;

      const matchExpr: unknown[] = ["match", ["get", imageFill.imageField]];
      for (const entry of entries) {
        if (imageResults.has(entry.imageId)) {
          matchExpr.push(entry.url);
          matchExpr.push(entry.imageId);
        }
      }
      // Fallback — empty string (no pattern)
      matchExpr.push("");

      try {
        map.setPaintProperty(fillLayerId, "fill-pattern", matchExpr);
        map.setPaintProperty(fillLayerId, "fill-opacity", imageFill.opacity);
      } catch {
        // Pattern property might not be supported for all layer types
      }
    }

    applyImageFills();

    return () => {
      cancelled = true;
      // Clean up images
      for (const id of addedImagesRef.current) {
        try {
          if (map.hasImage(id)) map.removeImage(id);
        } catch {
          // noop
        }
      }
      addedImagesRef.current = [];
    };
  }, [map, isReady, layerId, imageFill]);
}
