"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { FilterSpecification } from "maplibre-gl";
import { useMap } from "./use-map";
import type { TimelineMetadata } from "./manifest-compiler";

const SPEED_OPTIONS = [0.5, 1, 2, 4] as const;
export type PlaybackSpeed = (typeof SPEED_OPTIONS)[number];

export interface TimelinePlaybackState {
  /** Current step index (0-based). */
  currentStep: number;
  /** Whether playback is active. */
  isPlaying: boolean;
  /** Total number of steps. */
  totalSteps: number;
  /** Current step value (e.g. year). */
  currentValue: number;
  /** All step values. */
  steps: number[];
  /** Current playback speed multiplier. */
  speed: PlaybackSpeed;
  /** Available speed options. */
  speedOptions: readonly PlaybackSpeed[];
  play: () => void;
  pause: () => void;
  /** Jump to a specific step index. */
  setStep: (index: number) => void;
  /** Set playback speed multiplier. */
  setSpeed: (speed: PlaybackSpeed) => void;
}

/**
 * Timeline playback hook.
 *
 * Consumes _timeline metadata from the compiled layer and applies
 * map.setFilter() on each tick to show/hide features by time step.
 *
 * Features:
 * - Variable speed (0.5x–4x)
 * - Keyboard shortcuts: Space (play/pause), Left/Right (step), +/- (speed)
 *
 * @param layerId - The base layer ID prefix (used to find compiled layers).
 * @param timeline - Timeline metadata from compiled layer output.
 */
export function useTimelinePlayback(
  layerId: string | undefined,
  timeline: TimelineMetadata | null,
): TimelinePlaybackState | null {
  const { map, isReady } = useMap();
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState<PlaybackSpeed>(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const steps = timeline?.steps ?? [];
  const totalSteps = steps.length;

  // Clear interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Apply filter when step changes
  useEffect(() => {
    if (!map || !isReady || !timeline || !layerId || steps.length === 0) return;

    const step = steps[currentStep];
    if (step == null) return;

    // Find all layers belonging to this manifest layer
    const style = map.getStyle();
    if (!style?.layers) return;

    const targetLayers = style.layers.filter(
      (l) => l.id.startsWith(layerId) && !l.id.endsWith("-highlight"),
    );

    for (const layer of targetLayers) {
      try {
        const filterExpr = timeline.cumulative
          ? ["<=", ["get", timeline.timeField], step]
          : ["==", ["get", timeline.timeField], step];
        map.setFilter(layer.id, filterExpr as FilterSpecification);
      } catch {
        // Layer might not support filter
      }
    }
  }, [map, isReady, layerId, timeline, currentStep, steps]);

  const startInterval = useCallback(() => {
    if (!timeline || totalSteps === 0) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    const interval = timeline.playSpeed / speedRef.current;
    intervalRef.current = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % totalSteps);
    }, interval);
  }, [timeline, totalSteps]);

  const play = useCallback(() => {
    setIsPlaying(true);
    startInterval();
  }, [startInterval]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const setStep = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, totalSteps - 1));
      setCurrentStep(clamped);
    },
    [totalSteps],
  );

  const setSpeed = useCallback(
    (newSpeed: PlaybackSpeed) => {
      setSpeedState(newSpeed);
      speedRef.current = newSpeed;
      // If currently playing, restart interval with new speed
      if (intervalRef.current && timeline) {
        clearInterval(intervalRef.current);
        const interval = timeline.playSpeed / newSpeed;
        intervalRef.current = setInterval(() => {
          setCurrentStep((prev) => (prev + 1) % totalSteps);
        }, interval);
      }
    },
    [timeline, totalSteps],
  );

  // Keyboard shortcuts
  useEffect(() => {
    if (!timeline || steps.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture keys when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          if (isPlaying) pause();
          else play();
          break;
        case "ArrowLeft":
          e.preventDefault();
          setCurrentStep((prev) => Math.max(0, prev - 1));
          break;
        case "ArrowRight":
          e.preventDefault();
          setCurrentStep((prev) => Math.min(totalSteps - 1, prev + 1));
          break;
        case "+":
        case "=": {
          const idx = SPEED_OPTIONS.indexOf(speedRef.current);
          if (idx < SPEED_OPTIONS.length - 1) setSpeed(SPEED_OPTIONS[idx + 1]);
          break;
        }
        case "-":
        case "_": {
          const idx = SPEED_OPTIONS.indexOf(speedRef.current);
          if (idx > 0) setSpeed(SPEED_OPTIONS[idx - 1]);
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [timeline, steps.length, isPlaying, play, pause, totalSteps, setSpeed]);

  if (!timeline || steps.length === 0) return null;

  return {
    currentStep,
    isPlaying,
    totalSteps,
    currentValue: steps[currentStep] ?? 0,
    steps,
    speed,
    speedOptions: SPEED_OPTIONS,
    play,
    pause,
    setStep,
    setSpeed,
  };
}
