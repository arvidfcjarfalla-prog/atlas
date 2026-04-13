import { useEffect, useState } from "react";
import type { MapManifest } from "@atlas/data-models";
import type { MapRow } from "@/lib/supabase/types";
import type { AgentMessage } from "@/lib/hooks/use-agent-chat";
import type { DatasetProfile } from "@/lib/ai/types";
import { profileDataset } from "@/lib/ai/profiler";
import { fetchGeoJSON } from "@/app/app/(editor)/map/_lib/fetch-geojson";

export interface DraftRestore {
  manifest: MapManifest;
  geojsonUrl: string | null;
  timestamp: number;
}

export interface MapLoaderState {
  mapRow: MapRow | null;
  setMapRow: React.Dispatch<React.SetStateAction<MapRow | null>>;
  manifest: MapManifest | null;
  setManifest: React.Dispatch<React.SetStateAction<MapManifest | null>>;
  geojsonData: GeoJSON.FeatureCollection | null;
  setGeojsonData: React.Dispatch<React.SetStateAction<GeoJSON.FeatureCollection | null>>;
  dataProfile: DatasetProfile | null;
  setDataProfile: React.Dispatch<React.SetStateAction<DatasetProfile | null>>;
  initialChatMessages: AgentMessage[] | undefined;
  compareManifest: MapManifest | null;
  draftRestore: DraftRestore | null;
  setDraftRestore: React.Dispatch<React.SetStateAction<DraftRestore | null>>;
  legacyDataMissing: boolean;
  loading: boolean;
  notFound: boolean;
}

/**
 * Loads a map row from /api/maps/:id on mount (once id + auth are ready).
 * Fetches associated GeoJSON, profiles it, detects legacy data, and
 * restores any localStorage draft newer than the DB manifest.
 *
 * `compareManifest` is a one-shot structured clone captured at load time.
 * It intentionally is NOT re-derived when manifest changes — it represents
 * the saved baseline for the compare view.
 */
export function useMapLoader(id: string, authLoading: boolean): MapLoaderState {
  const [mapRow, setMapRow] = useState<MapRow | null>(null);
  const [manifest, setManifest] = useState<MapManifest | null>(null);
  const [geojsonData, setGeojsonData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [dataProfile, setDataProfile] = useState<DatasetProfile | null>(null);
  const [initialChatMessages, setInitialChatMessages] = useState<AgentMessage[] | undefined>(undefined);
  const [compareManifest, setCompareManifest] = useState<MapManifest | null>(null);
  const [draftRestore, setDraftRestore] = useState<DraftRestore | null>(null);
  const [legacyDataMissing, setLegacyDataMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id || authLoading) return;
    async function load() {
      const res = await fetch(`/api/maps/${id}`);
      if (!res.ok) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const json = await res.json();
      const row: MapRow = json.map;
      setMapRow(row);
      const m = row.manifest as unknown as MapManifest;
      setManifest(m);
      setCompareManifest(structuredClone(m));

      if (Array.isArray(row.chat_history) && row.chat_history.length > 0) {
        setInitialChatMessages(row.chat_history as unknown as AgentMessage[]);
      }

      try {
        const draftRaw = localStorage.getItem(`atlas:draft:${id}`);
        if (draftRaw) {
          const draft = JSON.parse(draftRaw);
          const dbUpdated = new Date(row.updated_at).getTime();
          if (draft.timestamp > dbUpdated && draft.manifest) {
            setDraftRestore(draft);
          } else {
            localStorage.removeItem(`atlas:draft:${id}`);
          }
        }
      } catch { /* ignore parse errors */ }

      const dataUrl = row.artifact_id
        ? `/api/datasets/${row.artifact_id}/geojson`
        : row.geojson_url ?? m.layers[0]?.sourceUrl;
      let dataLoaded = false;
      if (dataUrl) {
        const geo = await fetchGeoJSON(dataUrl);
        if (geo) {
          setGeojsonData(geo);
          setDataProfile(profileDataset(geo));
          dataLoaded = true;
        }
      }
      if (!dataLoaded && row.data_status === "legacy") {
        setLegacyDataMissing(true);
      }
      setLoading(false);
    }
    load();
  }, [id, authLoading]);

  return {
    mapRow,
    setMapRow,
    manifest,
    setManifest,
    geojsonData,
    setGeojsonData,
    dataProfile,
    setDataProfile,
    initialChatMessages,
    compareManifest,
    draftRestore,
    setDraftRestore,
    legacyDataMissing,
    loading,
    notFound,
  };
}
