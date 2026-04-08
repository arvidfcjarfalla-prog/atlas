"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useScroll, useTransform, useReducedMotion } from "framer-motion";
import { MapBlueprint } from "./render-pipeline/MapBlueprint";
import { StageList } from "./render-pipeline/StageList";
import { StageBlock } from "./render-pipeline/StageText";
import { STAGES, type StageId } from "./render-pipeline/stages";

const CSS = `
.arp-root {
  --paper:     #f5f4f0;
  --paper-2:   #fafaf7;
  --paper-3:   #ffffff;
  --ink:       #1a1f1c;
  --ink-2:     #3c4149;
  --ink-3:     #6f6e77;
  --ink-4:     #9a968e;
  --ink-5:     #c9c6bd;
  --gold:      #c4915a;
  --gold-deep: #9a6f3f;
  --gold-tint: rgba(196, 145, 90, 0.08);
  --gold-edge: rgba(196, 145, 90, 0.24);
  --hairline-1: rgba(26, 31, 28, 0.06);
  --hairline-2: rgba(26, 31, 28, 0.10);
  --hairline-3: rgba(26, 31, 28, 0.16);
  --ease:       cubic-bezier(0.165, 0.84, 0.44, 1);
  --ease-bounce: cubic-bezier(0.32, 1.5, 0.4, 1);
  --dur-in:     420ms;
  --dur-micro:  180ms;
  position: relative;
  color: var(--ink);
}
.arp-root *, .arp-root *::before, .arp-root *::after { box-sizing: border-box; }

.arp-island {
  background: var(--paper);
  color: var(--ink);
  padding: 88px clamp(24px, 5vw, 96px) 96px;
  border-radius: 6px;
  box-shadow: 0 1px 0 rgba(255,255,255,0.4) inset, 0 40px 100px rgba(0,0,0,0.35);
  position: relative;
  font-family: "Geist", -apple-system, system-ui, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
  font-feature-settings: "kern" 1, "liga" 1, "calt" 1;
}
.arp-island::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 1100px 700px at 15% 10%, rgba(196,145,90,0.05), transparent 55%),
    radial-gradient(ellipse 900px 600px at 85% 90%, rgba(26,31,28,0.03), transparent 55%);
  pointer-events: none;
  border-radius: inherit;
}

.arp-eyebrow {
  position: relative;
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--ink-3);
  margin-bottom: 28px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.arp-eyebrow::before {
  content: "";
  width: 24px;
  height: 1px;
  background: var(--gold);
  opacity: 0.7;
}

.arp-section-title {
  position: relative;
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  font-weight: 400;
  font-size: clamp(48px, 5.4vw, 80px);
  line-height: 0.98;
  letter-spacing: -0.022em;
  color: var(--ink);
  margin: 0 0 96px;
  max-inline-size: 16ch;
  text-wrap: balance;
}

.arp-grid {
  display: grid;
  grid-template-columns: 160px minmax(0, 1.2fr) minmax(0, 0.95fr);
  gap: 56px;
  align-items: start;
  position: relative;
}

/* ── Step list (left, sticky) ── */
.arp-step-list {
  position: sticky;
  top: 96px;
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.arp-step-item {
  display: grid;
  grid-template-columns: 10px 28px 1fr;
  align-items: center;
  column-gap: 12px;
  padding: 14px 0;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--hairline-1);
  color: var(--ink-4);
  font-family: "Geist", sans-serif;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.005em;
  text-align: left;
  cursor: pointer;
  transition: color var(--dur-micro) var(--ease);
}
.arp-step-item:last-child { border-bottom: 0; }
.arp-step-item:hover { color: var(--ink-2); }
.arp-step-item:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
  border-radius: 2px;
}
.arp-step-bullet {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: transparent;
  border: 1px solid currentColor;
  transition: background var(--dur-micro) var(--ease), border-color var(--dur-micro) var(--ease), transform var(--dur-micro) var(--ease-bounce), box-shadow var(--dur-in) var(--ease);
}
.arp-step-num {
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: inherit;
  font-feature-settings: "tnum" 1;
}
.arp-step-item.arp-active { color: var(--ink); }
.arp-step-item.arp-active .arp-step-num { color: var(--gold); }
.arp-step-item.arp-active .arp-step-bullet {
  background: var(--gold);
  border-color: var(--gold);
  transform: scale(1.15);
  box-shadow: 0 0 0 4px rgba(196, 145, 90, 0.12);
}

/* ── Map column (sticky center) ── */
.arp-map-col {
  position: sticky;
  top: 88px;
  align-self: start;
  display: flex;
  justify-content: center;
}
.arp-map-card {
  position: relative;
  background: var(--paper-2);
  border-radius: 14px;
  padding: 28px 30px 30px;
  box-shadow:
    0 0 0 1px var(--hairline-1),
    0 1px 2px rgba(26, 31, 28, 0.04),
    0 20px 52px rgba(26, 31, 28, 0.10);
  width: fit-content;
  max-width: 100%;
  transition: box-shadow 560ms var(--ease);
}
/* Stage 4: subtle gold ring — "active editing" */
.arp-map-card[data-stage="4"] {
  box-shadow:
    0 0 0 2px rgba(196, 145, 90, 0.30),
    0 1px 2px rgba(26, 31, 28, 0.04),
    0 20px 52px rgba(26, 31, 28, 0.10);
}
/* Stage 5: white document ring — "ready for export" */
.arp-map-card[data-stage="5"] {
  box-shadow:
    0 0 0 6px rgba(255, 255, 255, 0.85),
    0 0 0 7px rgba(26, 31, 28, 0.08),
    0 32px 80px rgba(26, 31, 28, 0.16);
}
.arp-map-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 24px;
  right: 24px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.9), transparent);
}
svg.arp-blueprint {
  display: block;
  height: min(74vh, 680px);
  aspect-ratio: 230 / 420;
  width: auto;
  max-width: 100%;
  overflow: visible;
}

/* ── Layer strategy ──
   New stage mapping:
     1 Describe — empty graticule + scan-line (prompt reading)
     2 Source   — outlines fade in + source chip (SCB found)
     3 Render   — fills fade in + legend + controls + Stockholm + hover on
     4 Refine   — refine bar appears + low-density kommuner dim (filter applied)
     5 Export   — format chips + shimmer sweep + corner marks
*/
.arp-layer-a, .arp-layer-b, .arp-layer-c { opacity: 1; }
.arp-layer-d {
  opacity: 0;
  transition: opacity var(--dur-in) var(--ease);
  transition-delay: 120ms;
}
.arp-map-card[data-stage="3"] .arp-layer-d,
.arp-map-card[data-stage="4"] .arp-layer-d,
.arp-map-card[data-stage="5"] .arp-layer-d { opacity: 1; }

/* ── Scroll-driven path reveals ──
   --scroll (0→1) is set by JS on .arp-island every frame.
   Stage centers: 1≈0.10, 2≈0.30, 3≈0.50, 4≈0.70, 5≈0.90
   Layer B (outlines): draw in 0.18→0.30 (clean at stage 1, done by stage 2 center)
   Layer C (fills):    fade in 0.38→0.50 (done by stage 3 center)
   279 paths, --i = 0..278 (sorted north→south by y).
   Stagger 0.00025 per path = 0.07 total sweep, ramp ×20 = 0.05 per path.
*/
.arp-layer-b path {
  stroke-dasharray: 1;
  stroke-dashoffset: calc(1 - clamp(0, (var(--scroll, 0) - 0.18 - var(--i, 0) * 0.00025) * 20, 1));
  opacity: 1;
}
.arp-layer-c path {
  opacity: clamp(0, (var(--scroll, 0) - 0.38 - var(--i, 0) * 0.00025) * 20, 1);
}

.arp-layer-b { stroke-opacity: 0.85; transition: stroke-opacity var(--dur-in) var(--ease); }
.arp-map-card[data-stage="3"] .arp-layer-b,
.arp-map-card[data-stage="4"] .arp-layer-b,
.arp-map-card[data-stage="5"] .arp-layer-b { stroke-opacity: 0.55; }

.arp-map-card[data-stage="3"] .arp-layer-c path,
.arp-map-card[data-stage="4"] .arp-layer-c path,
.arp-map-card[data-stage="5"] .arp-layer-c path { cursor: pointer; }
.arp-map-card[data-stage="3"] .arp-layer-c path:hover,
.arp-map-card[data-stage="4"] .arp-layer-c path:hover,
.arp-map-card[data-stage="5"] .arp-layer-c path:hover { fill-opacity: 0.7; }

/* Refine filter: scroll-driven saturation split on kommuner.
   Range 0.58→0.68 (stage 3→4 transition).
   Low-density (ranks 0-2): desaturate to grey + fade.
   High-density (ranks 3-5): boost saturation — gold stays rich. */
.arp-layer-c path[data-rank="0"],
.arp-layer-c path[data-rank="1"],
.arp-layer-c path[data-rank="2"] {
  fill-opacity: clamp(0.12, 1 - (var(--scroll, 0) - 0.58) * 8.6, 1);
  filter: saturate(clamp(0.1, 1 - (var(--scroll, 0) - 0.58) * 9, 1));
}
.arp-layer-c path[data-rank="3"],
.arp-layer-c path[data-rank="4"],
.arp-layer-c path[data-rank="5"] {
  filter: saturate(calc(1 + clamp(0, (var(--scroll, 0) - 0.58) * 5, 0.5)));
}

/* Layer E — proportional circles (stage 4+). Illustrates "add layers" narrative. */
.arp-layer-e {
  fill: var(--gold);
  fill-opacity: 0.55;
  stroke: var(--gold-deep);
  stroke-width: 0.5;
  opacity: 0;
  transition: opacity var(--dur-in) var(--ease);
}
.arp-map-card[data-stage="4"] .arp-layer-e,
.arp-map-card[data-stage="5"] .arp-layer-e {
  opacity: 1;
}

/* Stockholm marker — stage 3+ */
.arp-stockholm { opacity: 0; transition: opacity var(--dur-in) var(--ease); }
.arp-map-card[data-stage="3"] .arp-stockholm,
.arp-map-card[data-stage="4"] .arp-stockholm,
.arp-map-card[data-stage="5"] .arp-stockholm { opacity: 1; }
.arp-stockholm-dot { fill: var(--ink); }
.arp-stockholm-ring { fill: none; stroke: var(--ink); stroke-width: 0.6; }

@keyframes arp-stockholm-ping {
  0%   { transform: scale(0.4); opacity: 0.6; }
  70%  { opacity: 0.05; }
  100% { transform: scale(2.6); opacity: 0; }
}
.arp-map-card[data-stage="3"] .arp-stockholm-ring-1,
.arp-map-card[data-stage="4"] .arp-stockholm-ring-1,
.arp-map-card[data-stage="5"] .arp-stockholm-ring-1 {
  transform-box: fill-box;
  transform-origin: center;
  animation: arp-stockholm-ping 2.4s cubic-bezier(0, 0, 0.2, 1) infinite;
}
.arp-map-card[data-stage="3"] .arp-stockholm-ring-2,
.arp-map-card[data-stage="4"] .arp-stockholm-ring-2,
.arp-map-card[data-stage="5"] .arp-stockholm-ring-2 {
  transform-box: fill-box;
  transform-origin: center;
  animation: arp-stockholm-ping 2.4s cubic-bezier(0, 0, 0.2, 1) infinite;
  animation-delay: 1.2s;
}

/* Scan line (stage 1) — fades out with scroll */
.arp-scan-line {
  position: absolute;
  left: 30px;
  right: 32px;
  top: 5%;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, var(--gold) 50%, transparent 100%);
  opacity: clamp(0, 1 - (var(--scroll, 0) - 0.10) * 14, 1);
  pointer-events: none;
  z-index: 1;
  will-change: top, opacity;
}
@keyframes arp-scan-sweep {
  0%   { top: 4%;  opacity: 0; }
  12%  { opacity: 0.5; }
  88%  { opacity: 0.5; }
  100% { top: 96%; opacity: 0; }
}
.arp-map-card[data-stage="1"] .arp-scan-line {
  animation: arp-scan-sweep 4.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

/* Source chip */
.arp-source-chip {
  position: absolute;
  bottom: 18px;
  right: 20px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 13px 8px 11px;
  background: var(--gold-tint);
  border: 1px solid var(--gold-edge);
  border-radius: 7px;
  color: var(--gold-deep);
  font-family: "Geist", sans-serif;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: -0.003em;
  font-feature-settings: "tnum" 1;
  opacity: 0;
  transform: translateY(8px) scale(0.94);
  transition: opacity var(--dur-in) var(--ease), transform 560ms var(--ease-bounce);
  z-index: 2;
  box-shadow: 0 1px 2px rgba(196, 145, 90, 0.08);
}
.arp-chip-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--gold-deep);
  box-shadow: 0 0 0 2px var(--gold-tint);
}
.arp-map-card[data-stage="2"] .arp-source-chip,
.arp-map-card[data-stage="3"] .arp-source-chip,
.arp-map-card[data-stage="4"] .arp-source-chip,
.arp-map-card[data-stage="5"] .arp-source-chip {
  opacity: 1;
  transform: translateY(0) scale(1);
}

/* ── Map chrome: legend (stage 3+) ── */
.arp-map-legend {
  position: absolute;
  left: 22px;
  bottom: 22px;
  background: var(--paper-2);
  border: 1px solid var(--hairline-2);
  border-radius: 7px;
  padding: 9px 11px 10px;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity var(--dur-in) var(--ease), transform var(--dur-in) var(--ease);
  transition-delay: 120ms;
  z-index: 2;
  font-family: "Geist", sans-serif;
  box-shadow: 0 1px 2px rgba(26,31,28,0.05), 0 4px 12px rgba(26,31,28,0.06);
}
.arp-map-card[data-stage="3"] .arp-map-legend,
.arp-map-card[data-stage="4"] .arp-map-legend,
.arp-map-card[data-stage="5"] .arp-map-legend {
  opacity: 1;
  transform: translateY(0);
}
.arp-legend-title {
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 9px;
  font-weight: 500;
  color: var(--ink-3);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 6px;
}
.arp-legend-swatches {
  display: flex;
  height: 8px;
  border-radius: 2px;
  overflow: hidden;
  width: 104px;
  border: 1px solid var(--hairline-1);
}
.arp-legend-swatches span { flex: 1; height: 100%; }
.arp-legend-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 5px;
  font-size: 9px;
  color: var(--ink-4);
  font-family: "Geist", sans-serif;
  font-feature-settings: "tnum" 1;
}

/* ── Map chrome: pan/zoom controls (stage 3+) ── */
.arp-map-controls {
  position: absolute;
  top: 22px;
  right: 22px;
  display: flex;
  flex-direction: column;
  gap: 0;
  background: var(--paper-2);
  border: 1px solid var(--hairline-2);
  border-radius: 6px;
  overflow: hidden;
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity var(--dur-in) var(--ease), transform var(--dur-in) var(--ease);
  transition-delay: 80ms;
  z-index: 2;
  box-shadow: 0 1px 2px rgba(26,31,28,0.05), 0 4px 12px rgba(26,31,28,0.06);
}
.arp-map-card[data-stage="3"] .arp-map-controls,
.arp-map-card[data-stage="4"] .arp-map-controls,
.arp-map-card[data-stage="5"] .arp-map-controls {
  opacity: 1;
  transform: translateY(0);
}
.arp-ctrl-btn {
  width: 26px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--paper-3);
  color: var(--ink-2);
  font-family: "Geist", sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  border-bottom: 1px solid var(--hairline-1);
  user-select: none;
}
.arp-ctrl-btn:last-child { border-bottom: 0; }

/* ── Refine bar (stage 4 only) ── */
.arp-refine-bar {
  position: absolute;
  top: 22px;
  left: 22px;
  right: 62px;
  padding: 8px 12px 8px 11px;
  background: var(--paper-3);
  border: 1px solid var(--gold-edge);
  border-radius: 7px;
  display: flex;
  align-items: center;
  gap: 9px;
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity var(--dur-in) var(--ease), transform var(--dur-in) var(--ease);
  z-index: 3;
  box-shadow: 0 2px 8px rgba(196,145,90,0.14);
  font-family: "Geist", sans-serif;
}
.arp-map-card[data-stage="4"] .arp-refine-bar {
  opacity: 1;
  transform: translateY(0);
}
.arp-refine-caret {
  color: var(--gold);
  font-weight: 600;
  font-size: 13px;
  line-height: 1;
}
.arp-refine-text {
  font-size: 11px;
  color: var(--ink);
  font-weight: 500;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.003em;
}
.arp-refine-cursor {
  display: inline-block;
  width: 1.5px;
  height: 11px;
  background: var(--ink);
  margin-left: 1px;
  vertical-align: text-bottom;
  animation: arp-blink 1.1s step-end infinite;
}
.arp-refine-kbd {
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 9px;
  color: var(--ink-4);
  padding: 2px 5px;
  background: var(--paper);
  border: 1px solid var(--hairline-2);
  border-radius: 3px;
  letter-spacing: 0.02em;
}

/* ── Export overlay (stage 5 only): format chips + shimmer sweep + corner marks ── */
.arp-export-formats {
  position: absolute;
  top: 22px;
  left: 22px;
  right: 62px;
  display: flex;
  gap: 6px;
  z-index: 3;
  align-items: center;
}
.arp-format-chip {
  padding: 5px 9px 5px 8px;
  background: var(--paper-3);
  border: 1px solid var(--hairline-2);
  border-radius: 5px;
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 9px;
  font-weight: 500;
  color: var(--ink-2);
  letter-spacing: 0.04em;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  box-shadow: 0 1px 2px rgba(26,31,28,0.05), 0 3px 8px rgba(26,31,28,0.04);
  opacity: 0;
  transform: translateY(-6px) scale(0.94);
  transition: opacity var(--dur-in) var(--ease), transform 520ms var(--ease-bounce);
}
.arp-format-chip::before {
  content: "";
  width: 4px;
  height: 4px;
  background: var(--gold);
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--gold-tint);
}
.arp-format-chip.arp-delay-1 { transition-delay: 120ms; }
.arp-format-chip.arp-delay-2 { transition-delay: 240ms; }
.arp-map-card[data-stage="5"] .arp-format-chip {
  opacity: 1;
  transform: translateY(0) scale(1);
}

/* Shimmer sweep — thin gold line that moves bottom-up across the card */
.arp-export-shimmer {
  position: absolute;
  inset: 28px 30px 30px 30px;
  pointer-events: none;
  opacity: 0;
  z-index: 1;
  border-radius: 6px;
  overflow: hidden;
}
.arp-export-shimmer::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  height: 40%;
  top: 100%;
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgba(196, 145, 90, 0.00) 30%,
    rgba(196, 145, 90, 0.18) 48%,
    rgba(196, 145, 90, 0.28) 50%,
    rgba(196, 145, 90, 0.18) 52%,
    rgba(196, 145, 90, 0.00) 70%,
    transparent 100%
  );
}
@keyframes arp-export-sweep {
  0%   { top: 100%; }
  100% { top: -40%; }
}
.arp-map-card[data-stage="5"] .arp-export-shimmer {
  opacity: 1;
  transition: opacity var(--dur-in) var(--ease);
}
.arp-map-card[data-stage="5"] .arp-export-shimmer::before {
  animation: arp-export-sweep 3.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

/* Corner marks — selection handles at 4 corners (stage 5) */
.arp-export-corner {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--gold);
  opacity: 0;
  transform: scale(0.6);
  transition: opacity var(--dur-in) var(--ease), transform 520ms var(--ease-bounce);
  z-index: 3;
  pointer-events: none;
}
.arp-export-corner-tl { top: 14px; left: 14px; border-right: 0; border-bottom: 0; border-top-left-radius: 3px; }
.arp-export-corner-tr { top: 14px; right: 14px; border-left: 0; border-bottom: 0; border-top-right-radius: 3px; }
.arp-export-corner-bl { bottom: 14px; left: 14px; border-right: 0; border-top: 0; border-bottom-left-radius: 3px; }
.arp-export-corner-br { bottom: 14px; right: 14px; border-left: 0; border-top: 0; border-bottom-right-radius: 3px; }
.arp-map-card[data-stage="5"] .arp-export-corner {
  opacity: 1;
  transform: scale(1);
}
.arp-map-card[data-stage="5"] .arp-export-corner-tr { transition-delay: 60ms; }
.arp-map-card[data-stage="5"] .arp-export-corner-bl { transition-delay: 120ms; }
.arp-map-card[data-stage="5"] .arp-export-corner-br { transition-delay: 180ms; }

/* Cursor tooltip */
.arp-cursor-tooltip {
  position: absolute;
  pointer-events: none;
  padding: 9px 13px;
  background: rgba(26, 31, 28, 0.94);
  color: var(--paper);
  border-radius: 7px;
  font-family: "Geist", sans-serif;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: -0.003em;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 140ms var(--ease), transform 140ms var(--ease);
  z-index: 4;
  white-space: nowrap;
}
.arp-cursor-tooltip.arp-visible {
  opacity: 1;
  transform: translateY(0);
}
.arp-tt-label { color: var(--paper); font-weight: 600; }
.arp-tt-value {
  color: rgba(245, 244, 240, 0.68);
  font-feature-settings: "tnum" 1;
  margin-left: 8px;
}

/* ── Text column (right, scrolls) ── */
.arp-text-col { display: flex; flex-direction: column; }
.arp-stage-block {
  min-height: 72vh;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding: 10vh 0 28px;
  position: relative;
  scroll-margin-top: 96px;
}
.arp-stage-block:first-child { padding-top: 0; min-height: 62vh; }
.arp-stage-block:last-child  { min-height: 70vh; padding-bottom: 0; }

.arp-stage-num {
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--gold);
  margin-bottom: 18px;
  font-feature-settings: "tnum" 1;
}
.arp-stage-title {
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  font-size: clamp(32px, 3.6vw, 48px);
  font-weight: 400;
  line-height: 1.05;
  letter-spacing: -0.018em;
  color: var(--ink);
  margin: 0 0 18px;
  text-wrap: balance;
  max-inline-size: 22ch;
}
.arp-stage-body {
  font-family: "Geist", sans-serif;
  font-size: 16px;
  line-height: 1.58;
  color: var(--ink-2);
  margin: 0 0 24px;
  max-inline-size: 48ch;
  text-wrap: pretty;
}

/* ── Sub-visualizations ── */
.arp-subviz { margin: 4px 0 22px; }

/* Prompt input mock (stage 1) */
/* Stage 1 — Describe: prompt + separator + chips stacked */
/* ── Stage 1: Describe sub-viz ── */
.arp-viz-describe {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-inline-size: 48ch;
}
.arp-viz-prompt {
  background: var(--paper-3);
  border: 1px solid var(--hairline-2);
  border-radius: 12px 12px 4px 4px;
  padding: 16px 18px;
  box-shadow: 0 1px 3px rgba(26, 31, 28, 0.06), 0 8px 24px rgba(26, 31, 28, 0.04);
  font-family: "Geist", sans-serif;
  display: flex;
  align-items: center;
  gap: 10px;
}
.arp-viz-caret { color: var(--gold); font-weight: 500; font-size: 15px; }
.arp-viz-text { flex: 1; font-size: 15px; color: var(--ink); font-weight: 500; }
.arp-viz-cursor {
  display: inline-block;
  width: 1.5px;
  height: 16px;
  background: var(--ink);
  margin-left: 1px;
  vertical-align: text-bottom;
  animation: arp-blink 1.1s step-end infinite;
}
@keyframes arp-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
.arp-viz-kbd {
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 10px;
  color: var(--ink-4);
  padding: 3px 7px;
  background: var(--paper);
  border: 1px solid var(--hairline-2);
  border-radius: 4px;
  letter-spacing: 0.02em;
}
.arp-viz-understood {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 20px 20px;
  background: var(--gold-tint);
  border: 1px solid var(--gold-edge);
  border-top: 0;
  border-radius: 0 0 12px 12px;
}
.arp-viz-understood-label {
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gold-deep);
}
.arp-viz-understood-value {
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  font-size: 17px;
  line-height: 1.45;
  letter-spacing: -0.008em;
  color: var(--ink);
}

/* Source ledger (stage 2) — editorial spread, typography-first trust payload.
   Staggered enter fires once via [data-active="true"] set by a local
   IntersectionObserver in VizSources. prefers-reduced-motion is handled
   globally at the bottom of this stylesheet. */
.arp-source-v2 {
  padding: 24px 0 4px;
  max-inline-size: 560px;
  position: relative;
}
.arp-source-rule {
  width: 32px;
  height: 2px;
  background: var(--gold-deep);
  margin: 0 0 22px;
  transform-origin: left center;
  opacity: 0;
  transform: scaleX(0.15);
  transition: opacity 540ms ease-out, transform 540ms ease-out;
}
.arp-source-v2[data-active="true"] .arp-source-rule {
  opacity: 1;
  transform: scaleX(1);
}
.arp-source-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) 1px minmax(0, 1fr);
  gap: 26px;
  align-items: start;
}
.arp-source-divider {
  align-self: stretch;
  background: var(--hairline-2);
  min-height: 128px;
}
.arp-source-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.arp-source-eyebrow {
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.arp-source-display {
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  font-size: 72px;
  line-height: 0.9;
  letter-spacing: -0.025em;
  color: var(--ink);
  margin: 2px 0 4px;
}
.arp-source-display-sm {
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  font-size: 28px;
  line-height: 1.05;
  letter-spacing: -0.012em;
  color: var(--ink);
  margin: 2px 0 4px;
}
.arp-source-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--ink-2);
  margin: 0;
}
.arp-source-list span { white-space: nowrap; }
.arp-source-more {
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  font-size: 12px;
  letter-spacing: -0.005em;
  color: var(--ink-3);
  text-transform: none;
}
.arp-source-claim {
  margin: 28px 0 0;
  padding: 18px 0 0;
  border-top: 1px solid var(--hairline-1);
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  font-size: 22px;
  line-height: 1.3;
  letter-spacing: -0.008em;
  color: var(--ink);
  text-align: center;
}

/* Staggered entrance — each element fades + rises when data-active flips */
.arp-source-v2 .arp-source-eyebrow,
.arp-source-v2 .arp-source-display,
.arp-source-v2 .arp-source-display-sm,
.arp-source-v2 .arp-source-list,
.arp-source-v2 .arp-source-divider,
.arp-source-v2 .arp-source-claim {
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 560ms ease-out, transform 560ms ease-out;
}
.arp-source-v2[data-active="true"] .arp-source-col:first-child .arp-source-eyebrow { transition-delay: 100ms; }
.arp-source-v2[data-active="true"] .arp-source-col:first-child .arp-source-display  { transition-delay: 180ms; }
.arp-source-v2[data-active="true"] .arp-source-col:first-child .arp-source-list     { transition-delay: 260ms; }
.arp-source-v2[data-active="true"] .arp-source-divider                               { transition-delay: 320ms; }
.arp-source-v2[data-active="true"] .arp-source-col:last-child  .arp-source-eyebrow   { transition-delay: 360ms; }
.arp-source-v2[data-active="true"] .arp-source-col:last-child  .arp-source-display-sm{ transition-delay: 420ms; }
.arp-source-v2[data-active="true"] .arp-source-col:last-child  .arp-source-list      { transition-delay: 480ms; }
.arp-source-v2[data-active="true"] .arp-source-claim                                 { transition-delay: 560ms; }
.arp-source-v2[data-active="true"] .arp-source-eyebrow,
.arp-source-v2[data-active="true"] .arp-source-display,
.arp-source-v2[data-active="true"] .arp-source-display-sm,
.arp-source-v2[data-active="true"] .arp-source-list,
.arp-source-v2[data-active="true"] .arp-source-divider,
.arp-source-v2[data-active="true"] .arp-source-claim {
  opacity: 1;
  transform: none;
}

/* Stage 4 — Refine: editorial chat */
.arp-chat {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-inline-size: 48ch;
}
.arp-chat-turn {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.arp-chat-user {
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  font-size: 15px;
  line-height: 1.45;
  letter-spacing: -0.008em;
  color: var(--ink);
  padding: 14px 18px;
  background: var(--paper-3);
  border: 1px solid var(--hairline-2);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(26, 31, 28, 0.04);
}
.arp-chat-user.arp-chat-active {
  border-color: var(--gold-edge);
  box-shadow: 0 1px 3px rgba(26, 31, 28, 0.04), 0 0 0 1px var(--gold-edge);
}
.arp-chat-ai {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px;
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.01em;
  color: var(--ink-3);
}
.arp-chat-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--gold);
  flex-shrink: 0;
}

/* Export destinations (stage 5) */
.arp-viz-destinations {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
  max-inline-size: 48ch;
}
.arp-dest {
  background: var(--paper-3);
  border: 1px solid var(--hairline-2);
  border-radius: 10px;
  padding: 0;
  box-shadow: 0 1px 2px rgba(26, 31, 28, 0.03);
  overflow: hidden;
  transition: transform var(--dur-in) var(--ease), box-shadow var(--dur-in) var(--ease);
}
.arp-dest:hover {
  transform: translateY(-2px);
  box-shadow: 0 1px 2px rgba(26,31,28,0.03), 0 8px 20px rgba(26,31,28,0.08);
}
.arp-dest-preview {
  height: 78px;
  position: relative;
  overflow: hidden;
  border-bottom: 1px solid var(--hairline-1);
  background: var(--paper-2);
}
.arp-dest-preview svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.arp-dest-label {
  font-family: "Geist", sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
  padding: 9px 11px 2px;
}
.arp-dest-meta {
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 9.5px;
  color: var(--ink-4);
  padding: 0 11px 10px;
  letter-spacing: 0.02em;
}

/* ── Render tokens (stage 3 sub-viz) ── */
.arp-render-tokens {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-inline-size: 48ch;
}
.arp-render-token {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--paper-3);
  border: 1px solid var(--hairline-2);
  border-radius: 9px;
  box-shadow: 0 1px 2px rgba(26, 31, 28, 0.04);
}
.arp-render-token-label {
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 9px;
  font-weight: 500;
  color: var(--ink-4);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
  min-width: 52px;
}
/* Mini legend swatch bar */
.arp-render-legend-bar {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}
.arp-render-swatches {
  display: flex;
  height: 8px;
  border-radius: 2px;
  overflow: hidden;
  border: 1px solid var(--hairline-1);
}
.arp-render-swatches span { flex: 1; height: 100%; }
.arp-render-range {
  display: flex;
  justify-content: space-between;
  font-family: "Geist", sans-serif;
  font-size: 9px;
  color: var(--ink-4);
  font-feature-settings: "tnum" 1;
}
/* Source pill token */
.arp-render-source {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 13px 8px 11px;
  background: var(--gold-tint);
  border: 1px solid var(--gold-edge);
  border-radius: 7px;
  color: var(--gold-deep);
  font-family: "Geist", sans-serif;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: -0.003em;
  font-feature-settings: "tnum" 1;
  box-shadow: 0 1px 2px rgba(196, 145, 90, 0.08);
}
.arp-render-source-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--gold-deep);
  box-shadow: 0 0 0 2px var(--gold-tint);
}
/* Tooltip preview token */
.arp-render-tooltip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 13px;
  background: rgba(26, 31, 28, 0.94);
  border-radius: 7px;
  font-family: "Geist", sans-serif;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: -0.003em;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.arp-render-tt-label {
  color: var(--paper);
  font-weight: 600;
}
.arp-render-tt-value {
  color: rgba(245, 244, 240, 0.68);
  font-feature-settings: "tnum" 1;
}

/* Bullets */
.arp-stage-bullets {
  list-style: none;
  padding: 0;
  margin: 0;
}
.arp-stage-bullets li {
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 14px;
  padding: 12px 0;
  font-family: "Geist", sans-serif;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--ink-2);
  border-bottom: 1px solid var(--hairline-1);
}
.arp-stage-bullets li:last-child { border-bottom: 0; }
.arp-bnum {
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 10px;
  font-weight: 500;
  color: var(--ink-4);
  letter-spacing: 0.02em;
  padding-top: 2px;
  font-feature-settings: "tnum" 1;
}

/* ── Responsive ── */
@media (max-width: 1024px) {
  .arp-grid { grid-template-columns: 1fr; gap: 0; }
  .arp-step-list { display: none; }
  .arp-map-col {
    position: -webkit-sticky;
    position: sticky;
    top: 60px;
    order: 1;
    z-index: 1;
  }
  .arp-text-col {
    order: 2;
    position: relative;
    z-index: 2;
    background: var(--paper);
  }
  .arp-stage-block { min-height: 60vh; padding: 48px 0; }
  .arp-stage-block:first-child { min-height: 50vh; }
  svg.arp-blueprint { height: min(38vh, 340px); }
  .arp-viz-destinations { grid-template-columns: 1fr; }
  .arp-source-grid { grid-template-columns: 1fr; gap: 22px; }
  .arp-source-divider { display: none; }
  .arp-source-col:last-child {
    padding-top: 20px;
    border-top: 1px solid var(--hairline-1);
  }
  .arp-section-title { margin-bottom: 48px; }
  .arp-island { padding: 64px clamp(20px, 5vw, 40px) 72px; }
}

@media (prefers-reduced-motion: reduce) {
  .arp-root *, .arp-root *::before, .arp-root *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 200ms !important;
    transition-delay: 0ms !important;
  }
}
`;

export function AtlasRenderPipeline() {
  const [activeStage, setActiveStage] = useState<StageId>(1);
  const blockRefs = useRef<Array<HTMLElement | null>>([]);
  const textColRef = useRef<HTMLDivElement>(null);
  const islandRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  // Scroll-linked: tracks the text column's scroll progress (0→1).
  const { scrollYProgress } = useScroll({
    target: textColRef,
    offset: ["start end", "end start"],
  });
  const stageProgress = useTransform(scrollYProgress, [0, 1], [0.7, 5.3]);

  useEffect(() => {
    if (prefersReduced) {
      // Reduced motion fallback: discrete IO, no continuous scroll animation.
      const blocks = blockRefs.current.filter(
        (el): el is HTMLElement => el !== null,
      );
      if (blocks.length === 0) return;
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const n = parseInt(
                (entry.target as HTMLElement).dataset.stage ?? "1",
                10,
              );
              setActiveStage(n as StageId);
            }
          }
        },
        { rootMargin: "-35% 0px -35% 0px", threshold: 0 },
      );
      blocks.forEach((b) => io.observe(b));
      return () => io.disconnect();
    }

    // Continuous scroll: set --scroll (0→1) for CSS calc() on paths,
    // and flip data-stage (integer) for discrete chrome (legend, controls, etc.)
    let lastStage: StageId = 1;
    return stageProgress.on("change", (v) => {
      const scroll = Math.max(0, (v - 1) / 4); // map 1→5 to 0→1
      islandRef.current?.style.setProperty("--scroll", String(scroll));

      const next = Math.min(5, Math.max(1, Math.round(v))) as StageId;
      if (next !== lastStage) {
        lastStage = next;
        setActiveStage(next);
      }
    });
  }, [stageProgress, prefersReduced]);

  const jumpToStage = useCallback(
    (id: StageId) => {
      const target = blockRefs.current[id - 1];
      if (!target) return;
      target.scrollIntoView({
        behavior: prefersReduced ? "auto" : "smooth",
        block: "center",
      });
    },
    [prefersReduced],
  );

  return (
    <div className="arp-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div ref={islandRef} className="arp-island">
        <div className="arp-eyebrow">Atlas · How it works</div>
        <h2 className="arp-section-title">From prompt to a living map.</h2>

        <div className="arp-grid">
          <StageList
            stages={STAGES}
            activeStage={activeStage}
            onJump={jumpToStage}
          />

          <MapBlueprint stage={activeStage} />

          <div ref={textColRef} className="arp-text-col">
            {STAGES.map((stage, i) => (
              <StageBlock
                key={stage.id}
                stage={stage}
                ref={(el) => {
                  blockRefs.current[i] = el;
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
