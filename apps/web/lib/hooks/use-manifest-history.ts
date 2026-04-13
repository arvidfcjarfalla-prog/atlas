import { useCallback, useEffect, useState } from "react";
import type { MapManifest } from "@atlas/data-models";

export interface ManifestHistoryApi {
  manifestHistory: MapManifest[];
  redoStack: MapManifest[];
  canUndo: boolean;
  canRedo: boolean;
  pushHistory: (current: MapManifest) => void;
  handleUndo: () => void;
  handleRedo: () => void;
}

/**
 * Manifest undo/redo stacks with keyboard shortcuts (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z).
 *
 * `pushHistory(current)` appends to history AND clears redo — used by any
 * callsite that mutates manifest (chat update, regenerate, style change).
 * `handleUndo`/`handleRedo` move items between stacks and trigger autosave
 * so the restored manifest persists.
 */
export function useManifestHistory({
  manifest,
  setManifest,
  autoSave,
}: {
  manifest: MapManifest | null;
  setManifest: React.Dispatch<React.SetStateAction<MapManifest | null>>;
  autoSave: (m: MapManifest) => void;
}): ManifestHistoryApi {
  const [manifestHistory, setManifestHistory] = useState<MapManifest[]>([]);
  const [redoStack, setRedoStack] = useState<MapManifest[]>([]);

  const pushHistory = useCallback((current: MapManifest) => {
    setManifestHistory((h) => [...h, current]);
    setRedoStack([]);
  }, []);

  const handleUndo = useCallback(() => {
    if (manifestHistory.length === 0 || !manifest) return;
    const prev = manifestHistory[manifestHistory.length - 1];
    setRedoStack((r) => [...r, manifest]);
    setManifest(prev);
    setManifestHistory((h) => h.slice(0, -1));
    autoSave(prev);
  }, [manifest, manifestHistory, autoSave, setManifest]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || !manifest) return;
    const next = redoStack[redoStack.length - 1];
    setManifestHistory((h) => [...h, manifest]);
    setManifest(next);
    setRedoStack((r) => r.slice(0, -1));
    autoSave(next);
  }, [manifest, redoStack, autoSave, setManifest]);

  // Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (mod && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo]);

  return {
    manifestHistory,
    redoStack,
    canUndo: manifestHistory.length > 0,
    canRedo: redoStack.length > 0,
    pushHistory,
    handleUndo,
    handleRedo,
  };
}
