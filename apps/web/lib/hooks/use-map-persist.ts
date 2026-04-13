import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { MapManifest } from "@atlas/data-models";

export interface SaveMapArgs {
  title: string;
  prompt: string;
  manifest: MapManifest;
  geojsonUrl?: string | null;
}

export type SaveMapResult =
  | { ok: true; mapId: string }
  | { ok: false };

/**
 * Persist a freshly-generated map via POST /api/maps, invalidate the
 * recent-maps list, and redirect to /app/map/[id] on success.
 *
 * Returns structured result so callers decide whether to show a toast
 * on failure (template-load path ignores it; pipeline paths show an error).
 */
export function useMapPersist() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const saveAndRedirect = useCallback(
    async (args: SaveMapArgs): Promise<SaveMapResult> => {
      try {
        const res = await fetch("/api/maps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: args.title,
            prompt: args.prompt,
            manifest: args.manifest as unknown as Record<string, unknown>,
            geojson_url: args.geojsonUrl ?? null,
            is_public: false,
          }),
        });
        if (!res.ok) return { ok: false };
        const data = await res.json();
        const mapId: string | undefined = data.map?.id;
        if (!mapId) return { ok: false };
        queryClient.invalidateQueries({ queryKey: ["recent-maps"] });
        router.replace(`/app/map/${mapId}`);
        return { ok: true, mapId };
      } catch {
        return { ok: false };
      }
    },
    [router, queryClient],
  );

  return { saveAndRedirect };
}
