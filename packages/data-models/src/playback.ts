/**
 * Timeline playback types + constants.
 *
 * Shared between the `useTimelinePlayback` hook (map-core) and the
 * `TimelinePlaybackBar` UI (map-modules) so the bar doesn't need to
 * depend on map-core.
 */

export const SPEED_OPTIONS = [0.5, 1, 2, 4] as const;

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
