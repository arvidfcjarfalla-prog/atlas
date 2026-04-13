import { useCallback, useEffect, useRef } from "react";
import type { MapManifest } from "@atlas/data-models";
import type { AgentMessage } from "@/lib/hooks/use-agent-chat";
import { log, errorMessage } from "@/lib/logger";

export interface MapAutosaveApi {
  autoSave: (m: MapManifest, dataUrl?: string) => void;
  saveVersion: (m: MapManifest, prompt?: string) => void;
  saveDraft: (
    m: MapManifest,
    extras?: { dataUrl?: string; includeChatHistory?: boolean },
  ) => Promise<void>;
  isDirtyRef: React.MutableRefObject<boolean>;
  manifestRef: React.MutableRefObject<MapManifest | null>;
}

/**
 * Persistence coordination for an open map.
 *
 * Owns: debounced `autoSave` (1s) with localStorage write-through,
 * periodic `saveDraft` every 30s when dirty, reconnect handler on `online`
 * event, and beforeunload warning when `isDirtyRef.current` is true.
 *
 * `manifestRef.current = manifest` must be assigned during the parent's
 * render (we do it here in the hook body for the caller). Periodic and
 * online handlers read from the ref to get the latest manifest.
 *
 * `chatMessagesRef` is owned by the parent and passed in — it is populated
 * AFTER `useAgentChat` runs, which is after this hook. Only `autoSave`
 * includes chat history; periodic + reconnect save manifest only.
 */
export function useMapAutosave({
  id,
  manifest,
  chatMessagesRef,
  showToast,
}: {
  id: string;
  manifest: MapManifest | null;
  chatMessagesRef: React.MutableRefObject<AgentMessage[]>;
  showToast: (msg: string, type: "success" | "error") => void;
}): MapAutosaveApi {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const lastSaveFailedRef = useRef(false);
  const manifestRef = useRef<MapManifest | null>(null);

  // Render-time assignment so refs are always current.
  // This mirrors the pre-refactor pattern and is load-bearing — the
  // 30s interval and online handler read manifestRef synchronously.
  manifestRef.current = manifest;

  const saveDraft = useCallback(
    async (
      m: MapManifest,
      extras?: { dataUrl?: string; includeChatHistory?: boolean },
    ) => {
      if (!id) return;
      const body: Record<string, unknown> = {
        manifest: m as unknown as Record<string, unknown>,
        title: m.title,
      };
      if (extras?.dataUrl) body.geojson_url = extras.dataUrl;
      if (extras?.includeChatHistory) {
        body.chat_history = chatMessagesRef.current
          .filter((msg) => msg.content)
          .map((msg) => ({ role: msg.role, content: msg.content }));
      }
      try {
        const res = await fetch(`/api/maps/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.status === 401) {
          showToast("Sessionen har gått ut — logga in igen", "error");
          lastSaveFailedRef.current = true;
        } else if (!res.ok) {
          showToast("Kunde inte spara", "error");
          lastSaveFailedRef.current = true;
        } else {
          isDirtyRef.current = false;
          try { localStorage.removeItem(`atlas:draft:${id}`); } catch {}
          if (lastSaveFailedRef.current) {
            showToast("Sparad", "success");
            lastSaveFailedRef.current = false;
          }
        }
      } catch {
        showToast("Kunde inte spara", "error");
        lastSaveFailedRef.current = true;
      }
    },
    [id, chatMessagesRef, showToast],
  );

  const saveVersion = useCallback(
    (m: MapManifest, prompt?: string) => {
      if (!id) return;
      fetch(`/api/maps/${id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manifest: m as unknown as Record<string, unknown>,
          ...(prompt ? { prompt } : {}),
        }),
      })
        .then((res) => {
          if (!res.ok) {
            log("save.version.failed", { mapId: id, status: res.status });
          }
        })
        .catch((err) => {
          log("save.version.failed", { mapId: id, error: errorMessage(err) });
        });
    },
    [id],
  );

  const autoSave = useCallback(
    (m: MapManifest, dataUrl?: string) => {
      if (!id) return;
      isDirtyRef.current = true;

      try {
        localStorage.setItem(
          `atlas:draft:${id}`,
          JSON.stringify({ manifest: m, geojsonUrl: dataUrl ?? null, timestamp: Date.now() }),
        );
      } catch { /* localStorage might be full or unavailable */ }

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void saveDraft(m, { dataUrl, includeChatHistory: true });
      }, 1000);
    },
    [id, saveDraft],
  );

  // beforeunload warning
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // online reconnect: sync dirty manifest
  useEffect(() => {
    if (!id) return;
    const handler = () => {
      if (isDirtyRef.current && manifestRef.current) {
        void saveDraft(manifestRef.current);
      }
    };
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, [id, saveDraft]);

  // 30s periodic save when dirty
  useEffect(() => {
    if (!id) return;
    const interval = setInterval(() => {
      if (isDirtyRef.current && manifestRef.current) {
        void saveDraft(manifestRef.current);
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [id, saveDraft]);

  return { autoSave, saveVersion, saveDraft, isDirtyRef, manifestRef };
}
