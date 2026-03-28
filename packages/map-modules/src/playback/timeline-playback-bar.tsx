"use client";

/** Timeline playback state — mirrors the type from @atlas/map-core. */
interface TimelinePlaybackState {
  currentStep: number;
  isPlaying: boolean;
  totalSteps: number;
  currentValue: number;
  steps: number[];
  speed?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  speedOptions?: readonly any[];
  play: () => void;
  pause: () => void;
  setStep: (index: number) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSpeed?: (speed: any) => void;
}

/**
 * Glassmorphic playback bar for timeline maps.
 * Renders at the bottom of the map with play/pause, speed selector, slider, and step label.
 * Keyboard shortcuts: Space (play/pause), Left/Right (step), +/- (speed).
 */
export function TimelinePlaybackBar({
  state,
}: {
  state: TimelinePlaybackState;
}) {
  const {
    currentStep, isPlaying, totalSteps, currentValue,
    speed = 1, speedOptions, play, pause, setStep, setSpeed,
  } = state;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 20px",
        background: "rgba(12,16,24,0.75)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 12,
        zIndex: 10,
        fontFamily: "'Geist',sans-serif",
        minWidth: 320,
      }}
    >
      {/* Play/Pause */}
      <button
        onClick={isPlaying ? pause : play}
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(99,130,255,0.12)",
          border: "1px solid rgba(99,130,255,0.25)",
          borderRadius: 8,
          cursor: "pointer",
          color: "rgba(99,130,255,0.90)",
          fontSize: 14,
          flexShrink: 0,
        }}
        aria-label={isPlaying ? "Pausa" : "Spela"}
      >
        {isPlaying ? "\u23F8" : "\u25B6"}
      </button>

      {/* Speed selector */}
      {speedOptions && setSpeed && (
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          {speedOptions.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              style={{
                padding: "3px 6px",
                fontSize: 10,
                fontFamily: "'Geist Mono',monospace",
                background: speed === s ? "rgba(99,130,255,0.20)" : "transparent",
                border: speed === s
                  ? "1px solid rgba(99,130,255,0.35)"
                  : "1px solid transparent",
                borderRadius: 4,
                color: speed === s ? "rgba(99,130,255,0.90)" : "rgba(200,210,225,0.45)",
                cursor: "pointer",
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      )}

      {/* Current value label */}
      <span
        style={{
          fontFamily: "'Geist Mono',monospace",
          fontSize: 13,
          fontWeight: 600,
          color: "rgba(240,245,250,0.90)",
          minWidth: 48,
          textAlign: "center",
          flexShrink: 0,
        }}
      >
        {currentValue}
      </span>

      {/* Slider */}
      <input
        type="range"
        min={0}
        max={totalSteps - 1}
        value={currentStep}
        onChange={(e) => setStep(Number(e.target.value))}
        style={{
          flex: 1,
          height: 4,
          accentColor: "#6382ff",
          cursor: "pointer",
          minWidth: 120,
        }}
      />

      {/* Step counter */}
      <span
        style={{
          fontFamily: "'Geist Mono',monospace",
          fontSize: 10,
          color: "rgba(200,210,225,0.45)",
          flexShrink: 0,
        }}
      >
        {currentStep + 1}/{totalSteps}
      </span>
    </div>
  );
}
