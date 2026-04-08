"use client";

import { useMemo, useRef, useState, useCallback } from "react";
import { SWEDEN_CHOROPLETH_PATHS } from "@/components/generated/sweden-choropleth";
import {
  DENSITY_RAMP,
  RANK_BY_FILL,
  RANK_VALUE_LABELS,
  type StageId,
} from "./stages";

type Props = {
  stage: StageId;
};

type TooltipState = {
  visible: boolean;
  x: number;
  y: number;
  label: string;
  value: string;
};

// Representative kommun names by density rank for realistic tooltips
const KOMMUN_NAMES: Record<number, string[]> = {
  0: ["Jokkmokk", "Dorotea", "Sorsele", "Storuman", "Vilhelmina"],
  1: ["Kiruna", "Gällivare", "Strömsund", "Krokom", "Berg"],
  2: ["Östersund", "Mora", "Falun", "Bollnäs", "Hudiksvall"],
  3: ["Uppsala", "Västerås", "Örebro", "Umeå", "Linköping"],
  4: ["Göteborg", "Malmö", "Helsingborg", "Lund", "Norrköping"],
  5: ["Stockholm", "Solna", "Sundbyberg", "Lidingö", "Danderyd"],
};

// Proportional circles for stage 4 "add layers" visualization.
// Positions approximate major Swedish cities within viewBox="200 0 230 420".
// Radius reflects relative income level (illustrative, not data-accurate).
const CITY_CIRCLES = [
  { cx: 378, cy: 268, r: 7, label: "Stockholm" },
  { cx: 296, cy: 318, r: 5.5, label: "Göteborg" },
  { cx: 340, cy: 348, r: 4.5, label: "Malmö" },
  { cx: 355, cy: 250, r: 3.5, label: "Uppsala" },
  { cx: 320, cy: 260, r: 3, label: "Västerås" },
  { cx: 335, cy: 255, r: 3, label: "Örebro" },
  { cx: 358, cy: 280, r: 3, label: "Linköping" },
  { cx: 345, cy: 290, r: 2.5, label: "Jönköping" },
  { cx: 325, cy: 160, r: 3, label: "Umeå" },
  { cx: 295, cy: 140, r: 2.5, label: "Sundsvall" },
  { cx: 362, cy: 340, r: 2.5, label: "Helsingborg" },
  { cx: 350, cy: 310, r: 2, label: "Norrköping" },
] as const;

export function MapBlueprint({ stage }: Props) {
  // Sort paths top-down so the reveal wave sweeps from north to south.
  const sortedPaths = useMemo(() => {
    return SWEDEN_CHOROPLETH_PATHS.map((p, origIndex) => {
      const match = p.d.match(/M[\d.]+\s+([\d.]+)/);
      const yStart = match ? parseFloat(match[1]) : 0;
      const rank = RANK_BY_FILL[p.f] ?? 0;
      return { ...p, origIndex, yStart, rank };
    }).sort((a, b) => a.yStart - b.yStart);
  }, []);

  const cardRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    label: "",
    value: "",
  });

  const canHover = stage === 3 || stage === 4 || stage === 5;

  const onPathEnter = useCallback(
    (e: React.MouseEvent<SVGPathElement>) => {
      if (!canHover) return;
      const el = e.currentTarget;
      const index = parseInt(el.dataset.index ?? "0", 10);
      const rank = parseInt(el.dataset.rank ?? "0", 10);
      const names = KOMMUN_NAMES[rank] ?? KOMMUN_NAMES[0];
      const name = names[index % names.length];
      setTooltip((t) => ({
        ...t,
        visible: true,
        label: name,
        value: RANK_VALUE_LABELS[rank] ?? RANK_VALUE_LABELS[0],
      }));
    },
    [canHover],
  );

  const onPathLeave = useCallback(() => {
    setTooltip((t) => ({ ...t, visible: false }));
  }, []);

  const onCardMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!canHover) return;
      const card = cardRef.current;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const tw = 170;
      const th = 34;
      const px = x + tw + 18 > rect.width ? x - tw - 14 : x + 14;
      const py = y + th + 18 > rect.height ? y - th - 14 : y + 14;
      setTooltip((t) => ({ ...t, x: px, y: py }));
    },
    [canHover],
  );

  const onCardLeave = useCallback(() => {
    setTooltip((t) => ({ ...t, visible: false }));
  }, []);

  return (
    <div className="arp-map-col">
      <div
        ref={cardRef}
        className="arp-map-card"
        data-stage={stage}
        onMouseMove={onCardMove}
        onMouseLeave={onCardLeave}
      >
        {/* Corner marks — fade in on stage 5 to signal "selected for export" */}
        <div className="arp-export-corner arp-export-corner-tl" aria-hidden="true" />
        <div className="arp-export-corner arp-export-corner-tr" aria-hidden="true" />
        <div className="arp-export-corner arp-export-corner-bl" aria-hidden="true" />
        <div className="arp-export-corner arp-export-corner-br" aria-hidden="true" />

        <div className="arp-scan-line" aria-hidden="true" />

        {/* Export shimmer sweep — stage 5 */}
        <div className="arp-export-shimmer" aria-hidden="true" />

        <svg
          className="arp-blueprint"
          viewBox="200 0 230 420"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-labelledby="arp-map-title arp-map-desc"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title id="arp-map-title">Sweden population density map</title>
          <desc id="arp-map-desc">
            A choropleth of 279 Swedish municipalities. As the page scrolls
            through five stages, the map progresses from an empty coordinate
            frame to region outlines, to a filled choropleth with legend and
            source citation, to a refinable interactive map, to an exportable
            artifact ready for slides, articles, and reports.
          </desc>

          {/* Layer A — graticule */}
          <g className="arp-layer-a">
            <g stroke="rgba(26,31,28,0.05)" strokeWidth={0.4}>
              <line x1={250} y1={0} x2={250} y2={420} />
              <line x1={300} y1={0} x2={300} y2={420} />
              <line x1={350} y1={0} x2={350} y2={420} />
              <line x1={400} y1={0} x2={400} y2={420} />
              <line x1={200} y1={60} x2={430} y2={60} />
              <line x1={200} y1={130} x2={430} y2={130} />
              <line x1={200} y1={200} x2={430} y2={200} />
              <line x1={200} y1={270} x2={430} y2={270} />
              <line x1={200} y1={340} x2={430} y2={340} />
            </g>
          </g>

          {/* Layer B — municipality outlines (revealed stage 2+) */}
          <g
            className="arp-layer-b"
            fill="none"
            stroke="#1a1f1c"
            strokeWidth={0.4}
            strokeLinejoin="round"
          >
            {sortedPaths.map((p, i) => (
              <path
                key={`b-${p.origIndex}`}
                d={p.d}
                pathLength={1}
                style={{ ["--i" as unknown as string]: i } as React.CSSProperties}
              />
            ))}
          </g>

          {/* Layer C — choropleth fills (revealed stage 2+, hoverable stage 3+) */}
          <g
            className="arp-layer-c"
            stroke="rgba(26,31,28,0.35)"
            strokeWidth={0.18}
            strokeLinejoin="round"
          >
            {sortedPaths.map((p, i) => (
              <path
                key={`c-${p.origIndex}`}
                d={p.d}
                fill={p.f}
                data-index={i}
                data-rank={p.rank}
                style={{ ["--i" as unknown as string]: i } as React.CSSProperties}
                onMouseEnter={onPathEnter}
                onMouseLeave={onPathLeave}
              />
            ))}
          </g>

          {/* Layer D — Stockholm marker (revealed stage 3+) */}
          <g className="arp-layer-d">
            <g className="arp-stockholm" transform="translate(378 268)">
              <circle
                className="arp-stockholm-ring arp-stockholm-ring-1"
                cx={0}
                cy={0}
                r={4}
                opacity={0.5}
              />
              <circle
                className="arp-stockholm-ring arp-stockholm-ring-2"
                cx={0}
                cy={0}
                r={4}
                opacity={0.5}
              />
              <circle className="arp-stockholm-dot" cx={0} cy={0} r={2.6} />
            </g>
          </g>

          {/* Layer E — proportional income circles (stage 4+, "add layers" visual) */}
          <g className="arp-layer-e">
            {CITY_CIRCLES.map((c) => (
              <circle
                key={c.label}
                cx={c.cx}
                cy={c.cy}
                r={c.r}
              />
            ))}
          </g>
        </svg>

        {/* ── On-map UI chrome ────────────────────────────────────────── */}

        {/* Pan/zoom controls — stage 3+ */}
        <div className="arp-map-controls" aria-hidden="true">
          <div className="arp-ctrl-btn">+</div>
          <div className="arp-ctrl-btn">−</div>
        </div>

        {/* Legend — stage 3+ */}
        <div className="arp-map-legend" aria-hidden="true">
          <div className="arp-legend-title">Density</div>
          <div className="arp-legend-swatches">
            {DENSITY_RAMP.map((c) => (
              <span key={c} style={{ background: c }} />
            ))}
          </div>
          <div className="arp-legend-labels">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>

        {/* Source chip — stage 2+ */}
        <div className="arp-source-chip" role="note">
          <span className="arp-chip-dot" aria-hidden="true" />
          <span>Källa: SCB BE0101 · 2024</span>
        </div>

        {/* Refine bar — stage 4 only */}
        <div className="arp-refine-bar" aria-hidden="true">
          <span className="arp-refine-caret">›</span>
          <span className="arp-refine-text">
            Animate change from 2010 to 2023
            <span className="arp-refine-cursor" />
          </span>
          <span className="arp-refine-kbd">⏎</span>
        </div>

        {/* Export format chips — stage 5 only */}
        <div className="arp-export-formats" aria-hidden="true">
          <span className="arp-format-chip">PNG</span>
          <span className="arp-format-chip arp-delay-1">SVG</span>
          <span className="arp-format-chip arp-delay-2">PDF</span>
        </div>

        {/* Cursor tooltip */}
        <div
          className={`arp-cursor-tooltip${tooltip.visible ? " arp-visible" : ""}`}
          style={{ left: tooltip.x, top: tooltip.y }}
          aria-hidden="true"
        >
          <span className="arp-tt-label">{tooltip.label}</span>
          <span className="arp-tt-value">{tooltip.value}</span>
        </div>
      </div>
    </div>
  );
}
