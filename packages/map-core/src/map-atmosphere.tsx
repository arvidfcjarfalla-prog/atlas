"use client";

/**
 * Planet atmosphere effect — a cool gradient overlay
 * that gives the map a sense of curvature and depth.
 *
 * Renders a CSS-only overlay with pointer-events: none so it doesn't
 * interfere with map interaction. Sits on top of the map canvas.
 *
 * Uses cool blue-black tones to feel like actual atmosphere,
 * not a warm photographic filter.
 */
export function MapAtmosphere() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background: [
          // Bottom edge — deep ground shadow
          "linear-gradient(to top, rgba(5, 5, 10, 0.3) 0%, transparent 10%)",
          // Vignette — darkened edges pull focus to center of map
          "radial-gradient(ellipse 85% 75% at 50% 48%, transparent 45%, rgba(3, 5, 12, 0.25) 100%)",
        ].join(", "),
      }}
    />
  );
}
